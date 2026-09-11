import pytest

from app.config import Settings


def test_feature_flags_default_off() -> None:
    s = Settings(_env_file=None)
    assert (s.feature_eval, s.feature_synth_rewrite, s.feature_like_me, s.feature_export) == (
        False,
        False,
        False,
        False,
    )


def test_settings_read_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FEATURE_LIKE_ME", "true")
    monkeypatch.setenv("RATE_LIMIT_VISITOR_PER_MIN", "42")
    monkeypatch.setenv("WEB_ORIGIN", "https://persona.example")
    s = Settings(_env_file=None)
    assert s.feature_like_me is True
    assert s.rate_limit_visitor_per_min == 42
    assert s.web_origin == "https://persona.example"
