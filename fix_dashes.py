"""Replace -- with em dash in user_docs markdown files."""
import os
import glob

EM_DASH = '\u2014'

# Languages to process
langs = ['pl', 'es', 'ru', 'de']

base_dir = os.path.dirname(os.path.abspath(__file__))

for lang in langs:
    pattern = os.path.join(base_dir, 'user_docs', lang, '*.md')
    for filepath in sorted(glob.glob(pattern)):
        basename = os.path.basename(filepath)
        if basename == '10-wallet-and-exchange.md':
            continue

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Replace ' -- ' (space-dash-dash-space) with ' em_dash '
        new_content = content.replace(' -- ', f' {EM_DASH} ')

        if new_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Fixed: {lang}/{basename}')
        else:
            print(f'No changes: {lang}/{basename}')
