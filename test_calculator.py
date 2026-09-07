import pytest

from calculator import calculate, format_result, parse


@pytest.mark.parametrize(
    "a, op, b, expected",
    [
        (3, "+", 4, 7),
        (10, "-", 4, 6),
        (6, "*", 7, 42),
        (10, "/", 4, 2.5),
        (-2, "*", -3, 6),
    ],
)
def test_calculate(a, op, b, expected):
    assert calculate(a, op, b) == expected


def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError):
        calculate(1, "/", 0)


def test_unknown_operator():
    with pytest.raises(ValueError):
        calculate(1, "%", 2)


def test_parse():
    assert parse(["3", "+", "4"]) == (3.0, "+", 4.0)


def test_parse_wrong_length():
    with pytest.raises(ValueError):
        parse(["3", "+"])


@pytest.mark.parametrize("value, expected", [(7.0, "7"), (2.5, "2.5"), (-3.0, "-3")])
def test_format_result(value, expected):
    assert format_result(value) == expected
