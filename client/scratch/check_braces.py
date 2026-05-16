import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    bracket_balance = 0
    square_balance = 0
    curly_balance = 0
    
    for i, line in enumerate(lines):
        for char in line:
            if char == '[': square_balance += 1
            if char == ']': square_balance -= 1
            
            if char == '{': curly_balance += 1
            if char == '}': curly_balance -= 1
            
            if char == '(': bracket_balance += 1
            if char == ')': bracket_balance -= 1
        
        if square_balance < 0:
            print(f"Line {i+1}: Negative square balance! (Too many ])")
            square_balance = 0 # Reset to continue
        if curly_balance < 0:
            print(f"Line {i+1}: Negative curly balance! (Too many }})")
            curly_balance = 0
        if bracket_balance < 0:
            print(f"Line {i+1}: Negative bracket balance! (Too many ))")
            bracket_balance = 0

    print(f"Final balances: Square={square_balance}, Curly={curly_balance}, Parentheses={bracket_balance}")

if __name__ == "__main__":
    check_braces(sys.argv[1])
