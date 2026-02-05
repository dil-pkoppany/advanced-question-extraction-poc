"""
Minimal POC: Extract checkbox labels from Excel VML and write to a new column.
Preserves checkboxes by carefully modifying Excel at ZIP/XML level.
Target: ESG DDQ sheet, checkboxes in column F (rows 27-102)
"""
import re
import os
from html import unescape
from zipfile import ZipFile, ZIP_DEFLATED


def extract_and_write_checkbox_labels(file_path: str) -> None:
    """Extract checkbox labels from VML and write to an empty column, preserving checkboxes."""
    
    # Step 1: Extract checkbox data from VML
    checkboxes = []
    with ZipFile(file_path, 'r') as zf:
        vml_files = [f for f in zf.namelist() if 'vmlDrawing' in f]
        
        for vml_file in vml_files:
            vml_content = zf.read(vml_file).decode('utf-8')
            
            # Find all checkbox shapes
            shape_pattern = r'<v:shape[^>]*>.*?</v:shape>'
            for shape in re.findall(shape_pattern, vml_content, re.DOTALL):
                if 'ObjectType="Checkbox"' not in shape:
                    continue
                
                # Extract label from <font> tag
                label_match = re.search(r'<font[^>]*>(.*?)</font>', shape, re.DOTALL)
                # Extract linked cell (e.g., $F$30)
                link_match = re.search(r'<x:FmlaLink>([^<]+)</x:FmlaLink>', shape)
                
                if label_match and link_match:
                    label = re.sub(r'\s+', ' ', label_match.group(1)).strip()
                    label = unescape(label)
                    checkboxes.append({
                        'label': label,
                        'cell': link_match.group(1)
                    })
    
    print(f"Found {len(checkboxes)} checkboxes")
    
    # Step 2: Find sheet file for "ESG DDQ"
    with ZipFile(file_path, 'r') as zf:
        workbook_xml = zf.read('xl/workbook.xml').decode('utf-8')
        rels_xml = zf.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    
    sheet_match = re.search(r'<sheet[^>]*name="ESG DDQ"[^>]*r:id="([^"]+)"', workbook_xml)
    if not sheet_match:
        print("ERROR: Could not find ESG DDQ sheet")
        return
    
    rid = sheet_match.group(1)
    rel_match = re.search(rf'<Relationship[^>]*Id="{rid}"[^>]*Target="([^"]+)"', rels_xml)
    if not rel_match:
        print("ERROR: Could not find sheet file")
        return
    
    sheet_file = 'xl/' + rel_match.group(1).lstrip('/')
    print(f"Modifying sheet: {sheet_file}")
    
    # Step 3: Read sheet XML
    with ZipFile(file_path, 'r') as zf:
        sheet_xml = zf.read(sheet_file).decode('utf-8')
    
    # Find the highest column letter used in the sheet
    all_cols = re.findall(r'r="([A-Z]+)\d+"', sheet_xml)
    if all_cols:
        max_col = max(all_cols, key=lambda c: (len(c), c))
        # Get next column letter
        if len(max_col) == 1 and max_col < 'Z':
            target_col = chr(ord(max_col) + 1)
        else:
            # For simplicity, use a column we know is likely empty
            target_col = 'P'  # Far enough to be safe
        print(f"Highest column found: {max_col}, will write to: {target_col}")
    else:
        target_col = 'G'
    
    modified_xml = sheet_xml
    
    # Add header for the new column in row 26 (where other headers are)
    header_cell = f'<c r="{target_col}26" t="inlineStr"><is><t>Checkbox Alt texts</t></is></c>'
    row26_pattern = r'(<row[^>]*r="26"[^>]*>)(.*?)(</row>)'
    row26_match = re.search(row26_pattern, modified_xml, re.DOTALL)
    if row26_match:
        new_row26 = row26_match.group(1) + row26_match.group(2) + header_cell + row26_match.group(3)
        modified_xml = modified_xml[:row26_match.start()] + new_row26 + modified_xml[row26_match.end():]
        print(f"Added header 'Checkbox Alt texts' in {target_col}26")
    
    # Write labels to the target column
    written = 0
    for cb in checkboxes:
        match = re.match(r'\$?[A-Z]+\$?(\d+)', cb['cell'])
        if not match:
            continue
        
        row_num = int(match.group(1))
        if not (27 <= row_num <= 102):
            continue
        
        cell_ref = f"{target_col}{row_num}"
        label = cb['label'].replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
        
        new_cell = f'<c r="{cell_ref}" t="inlineStr"><is><t>{label}</t></is></c>'
        
        # Insert cell into the row
        row_pattern = rf'(<row[^>]*r="{row_num}"[^>]*>)(.*?)(</row>)'
        row_match = re.search(row_pattern, modified_xml, re.DOTALL)
        if row_match:
            new_row = row_match.group(1) + row_match.group(2) + new_cell + row_match.group(3)
            modified_xml = modified_xml[:row_match.start()] + new_row + modified_xml[row_match.end():]
            print(f"  Row {row_num} -> {cell_ref}: {cb['label'][:50]}...")
            written += 1
        else:
            print(f"  WARNING: Row {row_num} not found")
    
    # Step 4: Write back to ZIP
    temp_path = file_path + '.tmp'
    
    with ZipFile(file_path, 'r') as zf_in:
        with ZipFile(temp_path, 'w', ZIP_DEFLATED) as zf_out:
            for item in zf_in.namelist():
                if item == sheet_file:
                    zf_out.writestr(item, modified_xml.encode('utf-8'))
                else:
                    zf_out.writestr(item, zf_in.read(item))
    
    os.replace(temp_path, file_path)
    
    print(f"\nWritten {written} labels to column {target_col} (checkboxes preserved)")


if __name__ == '__main__':
    file_path = "ESG_Due_diligence_surveys_with_answer_values.xlsx"
    extract_and_write_checkbox_labels(file_path)
