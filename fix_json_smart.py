import os
import re

helper = """
const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return {} as any; } };
"""

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if "JSON.parse" not in content or "tryParse" in content:
        return
        
    original = content
    content = content.replace("JSON.parse(trimmedStdout)", "tryParse(trimmedStdout)")
    content = content.replace("JSON.parse(stdout.trim() || '{}')", "tryParse(stdout.trim() || '{}')")
    content = content.replace("JSON.parse(rawStatus)", "tryParse(rawStatus)")
    content = content.replace("JSON.parse(JSON.stringify(update))", "tryParse(JSON.stringify(update))")
    content = content.replace("JSON.parse(candidate)", "tryParse(candidate)")
    content = content.replace("JSON.parse(payload)", "tryParse(payload)")
    content = content.replace("JSON.parse(line)", "tryParse(line)")
    content = content.replace("JSON.parse(readFileSync(sessionPath, 'utf-8'))", "tryParse(readFileSync(sessionPath, 'utf-8'))")
    content = content.replace("JSON.parse(await readFile(filePath, 'utf-8'))", "tryParse(await readFile(filePath, 'utf-8'))")
    content = content.replace("JSON.parse(readFileSync(payloadPath, 'utf-8'))", "tryParse(readFileSync(payloadPath, 'utf-8'))")
    content = content.replace("JSON.parse(text)", "tryParse(text)")
    content = content.replace("JSON.parse(Buffer.concat(chunks).toString('utf-8'))", "tryParse(Buffer.concat(chunks).toString('utf-8'))")
    content = content.replace("JSON.parse(trimmed)", "tryParse(trimmed)")
    content = content.replace("JSON.parse(stdout)", "tryParse(stdout)")
    content = content.replace("JSON.parse(raw)", "tryParse(raw)")
    content = content.replace("JSON.parse(row.json_value)", "tryParse(row.json_value)")
    
    if content != original:
        # Find the end of imports
        lines = content.split('\n')
        insert_idx = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                insert_idx = i + 1
        
        lines.insert(insert_idx, helper)
        content = '\n'.join(lines)
        
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, _, files in os.walk("src"):
    for file in files:
        if file.endswith(".ts"):
            patch_file(os.path.join(root, file))

