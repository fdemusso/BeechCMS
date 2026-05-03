
import sys

path = 'docs/vertical-slice.md'
try:
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # We want to keep lines until the checklist item about @beechcms/core
    # and then stop.
    
    cutoff = -1
    for i, line in enumerate(lines):
        if 'Se la feature tocca tipi o validazione condivisi, estendere `@beechcms/core`.' in line:
            cutoff = i + 1
            break
        # Fallback if the backticks are missing
        if 'Se la feature tocca tipi o validazione condivisi, estendere @beechcms/core.' in line:
            cutoff = i + 1
            break

    if cutoff != -1:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines[:cutoff])
        print(f"Success: Cut off at line {cutoff}")
    else:
        print("Error: Cutoff line not found")

except Exception as e:
    print(f"Error: {e}")
