"""간단한 사칙연산 계산기.

사용법:
    python calculator.py 3 + 4
    python calculator.py 10 / 4
인자 없이 실행하면 대화형 모드로 동작합니다.
"""

import sys

OPERATORS = {
    "+": lambda a, b: a + b,
    "-": lambda a, b: a - b,
    "*": lambda a, b: a * b,
    "/": lambda a, b: a / b,
}


def calculate(a, op, b):
    """a op b 를 계산해서 결과를 돌려준다."""
    if op not in OPERATORS:
        raise ValueError(f"지원하지 않는 연산자입니다: {op}")
    if op == "/" and b == 0:
        raise ZeroDivisionError("0으로 나눌 수 없습니다.")
    return OPERATORS[op](a, b)


def parse(tokens):
    """['3', '+', '4'] 형태의 토큰을 (3.0, '+', 4.0) 으로 바꾼다."""
    if len(tokens) != 3:
        raise ValueError("입력 형식: <숫자> <연산자> <숫자>")
    a, op, b = tokens
    return float(a), op, float(b)


def format_result(value):
    """정수로 떨어지면 소수점을 떼고 출력한다."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return f"{value:g}"


def interactive():
    print("간단 계산기 (종료: q)")
    while True:
        line = input("> ").strip()
        if line in {"q", "quit", "exit"}:
            break
        if not line:
            continue
        try:
            a, op, b = parse(line.split())
            print(format_result(calculate(a, op, b)))
        except (ValueError, ZeroDivisionError) as exc:
            print(f"오류: {exc}")


def main(argv):
    if not argv:
        interactive()
        return 0
    try:
        a, op, b = parse(argv)
        print(format_result(calculate(a, op, b)))
    except (ValueError, ZeroDivisionError) as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
