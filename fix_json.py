import os

helper = """
const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return {} as any; } };
"""

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    if "JSON.parse" not in content or "tryParse" in content:
        return
        
    # builderBridge.ts
    content = content.replace("JSON.parse(trimmedStdout)", "tryParse(trimmedStdout)")
    content = content.replace("JSON.parse(stdout.trim() || '{}')", "tryParse(stdout.trim() || '{}')")
    
    # index.ts
    content = content.replace("JSON.parse(rawStatus)", "tryParse(rawStatus)")
    content = content.replace("JSON.parse(JSON.stringify(update))", "tryParse(JSON.stringify(update))")
    
    # llm.ts
    content = content.replace("JSON.parse(candidate)", "tryParse(candidate)")
    content = content.replace("JSON.parse(payload)", "tryParse(payload)")
    content = content.replace("JSON.parse(line)", "tryParse(line)")
    
    # recursive.ts
    content = content.replace("JSON.parse(readFileSync(sessionPath, 'utf-8'))", "tryParse(readFileSync(sessionPath, 'utf-8'))")
    content = content.replace("JSON.parse(await readFile(filePath, 'utf-8'))", "tryParse(await readFile(filePath, 'utf-8'))")
    content = content.replace("JSON.parse(readFileSync(payloadPath, 'utf-8'))", "tryParse(readFileSync(payloadPath, 'utf-8'))")
    
    # missionRelay.ts
    content = content.replace("JSON.parse(text)", "tryParse(text)")
    content = content.replace("JSON.parse(Buffer.concat(chunks).toString('utf-8'))", "tryParse(Buffer.concat(chunks).toString('utf-8'))")
    
    # accessActions.ts, chipCreate.ts, chipLoop.ts
    content = content.replace("JSON.parse(trimmed)", "tryParse(trimmed)")
    content = content.replace("JSON.parse(stdout)", "tryParse(stdout)")
    
    # pathLoop.ts
    content = content.replace("JSON.parse(await readFile(filePath, 'utf-8'))", "tryParse(await readFile(filePath, 'utf-8'))")
    
    # naturalRouteLedger.ts
    content = content.replace("JSON.parse(line)", "tryParse(line)")
    
    # traceRepair.ts
    content = content.replace("JSON.parse(raw)", "tryParse(raw)")
    
    # authorityStatus.ts
    content = content.replace("JSON.parse(raw)", "tryParse(raw)")

    # memoryMovement.ts
    content = content.replace("JSON.parse(raw)", "tryParse(raw)")
    
    # capabilityGarden.ts
    content = content.replace("JSON.parse(raw)", "tryParse(raw)")
    
    # jsonState.ts
    content = content.replace("JSON.parse(row.json_value)", "tryParse(row.json_value)")
    
    # shippedProjectContext.ts
    content = content.replace("JSON.parse(text)", "tryParse(text)")
    
    # Only prepend helper if we made changes
    if "tryParse(" in content:
        # Prepend the helper
        content = helper + content
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, _, files in os.walk("src"):
    for file in files:
        if file.endswith(".ts"):
            patch_file(os.path.join(root, file))

