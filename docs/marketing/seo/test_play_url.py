import sys, os, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import build_blog as bb


def params(url):
    ref = urllib.parse.parse_qs(urllib.parse.urlparse(url.replace("&amp;", "&")).query)["referrer"][0]
    return dict(urllib.parse.parse_qsl(ref))


def test_carries_both_schemes():
    p = params(bb.play_url("footer", "pl"))
    assert p["src"] == "blog" and p["loc"] == "footer" and p["lang"] == "pl"
    assert p["utm_source"] == "blog" and p["utm_medium"] == "footer"


def test_help_generator_is_not_filed_as_blog():
    assert params(bb.play_url("cta", "en", "help"))["src"] == "help"


def test_uses_bcp47_so_ukrainian_is_not_two_names_in_one_column():
    assert params(bb.play_url("cta", "ua"))["lang"] == "uk"


def test_starts_with_the_bare_play_url_so_the_ga4_store_click_check_still_matches():
    # build_landing's tracker does indexOf(PLAY) === 0.
    assert bb.play_url("cta", "en").startswith(bb.PLAY)


def test_separator_is_html_escaped_because_this_lands_in_an_attribute():
    assert "&amp;referrer=" in bb.play_url("cta", "en")
