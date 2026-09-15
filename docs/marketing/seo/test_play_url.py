import re, sys, os, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import build_blog as bb

BARE_BODY_LINK = ("Get it on [Google Play]"
                   "(https://play.google.com/store/apps/details?id=com.budget.assistant).")


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


# --- ABA-553 Task 6b: the bare Play link 191 blog articles write in prose ---------------

def _rendered_href(html_out):
    m = re.search(r'href="([^"]+)"', html_out)
    assert m, f"no href found in {html_out!r}"
    return m.group(1)


def test_body_link_tagged_with_loc_body_and_src_blog_pl():
    href = _rendered_href(bb.to_html(BARE_BODY_LINK, "pl"))
    assert href.startswith(bb.PLAY)
    p = params(href)
    assert p["src"] == "blog" and p["loc"] == "body" and p["lang"] == "pl"


def test_body_link_tagged_with_loc_body_and_src_blog_de():
    href = _rendered_href(bb.to_html(BARE_BODY_LINK, "de"))
    assert href.startswith(bb.PLAY)
    p = params(href)
    assert p["src"] == "blog" and p["loc"] == "body" and p["lang"] == "de"


def test_body_link_amp_escaped_exactly_once_not_double_escaped():
    out = bb.to_html(BARE_BODY_LINK, "en")
    assert "&amp;referrer=" in out
    assert "&amp;amp;" not in out


def test_play_url_with_extra_query_params_is_left_untouched():
    body = ("[Google Play](https://play.google.com/store/apps/details"
            "?id=com.budget.assistant&hl=pl)")
    out = bb.to_html(body, "pl")
    # markdown itself escapes the literal & in the source URL to &amp; -- that is NOT
    # our rewrite: no &referrer= is ever appended, so the href is exactly what was written.
    assert "referrer=" not in out
    assert ('href="https://play.google.com/store/apps/details'
            '?id=com.budget.assistant&amp;hl=pl"') in out


def test_body_link_untouched_when_no_lang_passed_matches_build_help_call_shape():
    # build_help.py calls bb.to_html(transform(a["raw"], lang)) with ONE positional arg,
    # so lang defaults to None here -- help articles must render byte-identical output.
    out = bb.to_html(BARE_BODY_LINK)
    assert out == (
        '<p>Get it on <a href="https://play.google.com/store/apps/details'
        '?id=com.budget.assistant">Google Play</a>.</p>'
    )


def test_body_link_src_follows_caller_defaulting_help_if_ever_wired():
    href = _rendered_href(bb.to_html(BARE_BODY_LINK, "en", "help"))
    assert params(href)["src"] == "help"
