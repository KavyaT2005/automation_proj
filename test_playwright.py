import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content('<input id="test" />')
    page.evaluate('window.fn = (e) => "hello"')
    elem = page.query_selector('input')
    try:
        # What does this return?
        res = page.evaluate("window.fn", elem)
        print('RESULT of window.fn:', res)
    except Exception as e:
        print('ERROR:', e)
        
    try:
        # What if it's evaluated with ()?
        res2 = page.evaluate("(elem) => window.fn(elem)", elem)
        print('RESULT of (elem) => window.fn(elem):', res2)
    except Exception as e:
        print('ERROR2:', e)
    browser.close()
