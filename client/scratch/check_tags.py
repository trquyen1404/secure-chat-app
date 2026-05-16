import sys

def find_unbalanced_lines(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for i, line in enumerate(lines):
        opens = line.count('[')
        closes = line.count(']')
        if opens != closes:
            print(f"Line {i+1} might be unbalanced: Opens={opens}, Closes={closes}")
            print(f"Content: {line.strip()}")

if __name__ == "__main__":
    find_unbalanced_lines(sys.argv[1])
