# test

간단한 파이썬 예제 모음입니다.

## 파일

| 파일 | 설명 |
| --- | --- |
| `hello.py` | 인사말과 현재 시각을 출력하는 예제 |
| `calculator.py` | 사칙연산 계산기 (CLI + 대화형 모드) |
| `test_calculator.py` | `calculator.py` 의 pytest 테스트 |

## 실행 방법

한 줄로 계산하기:

```bash
python calculator.py 3 + 4     # 7
python calculator.py 10 / 4    # 2.5
```

대화형 모드 (종료는 `q`):

```bash
python calculator.py
> 6 * 7
42
> q
```

## 테스트

```bash
pip install pytest
pytest -q
```

`main` 브랜치에 파이썬 파일이 푸시되면 GitHub Actions 가 예제 실행과 테스트를 자동으로 수행합니다.
