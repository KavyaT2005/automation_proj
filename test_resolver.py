import json
from playwright.sync_api import sync_playwright

JS_RESOLVER_DEFINITION = """
window.resolveInputLabel = (elem) => {
    if (!elem) return '';
    function clean(txt) {
        return txt ? txt.replace(/[\\u200b\\u200c\\n]/g, '').replace(/\\*$/, '').trim() : '';
    }
    
    let ariaLabel = elem.getAttribute('aria-label');
    if (ariaLabel && clean(ariaLabel)) return clean(ariaLabel);
    
    let placeholder = elem.getAttribute('placeholder');
    if (placeholder && clean(placeholder)) return clean(placeholder);
    
    let id = elem.id;
    if (id) {
        let label = document.querySelector(`label[for="${id}"]`);
        if (label && clean(label.innerText)) return clean(label.innerText);
    }
    
    let current = elem;
    for (let i = 0; i < 5; i++) {
        let parent = current.parentElement;
        if (!parent) break;
        
        let legend = parent.querySelector('legend');
        if (legend && clean(legend.innerText)) {
            let txt = clean(legend.innerText);
            if (txt.length > 0 && txt.length < 50) return txt;
        }
        
        let sibling = current.previousElementSibling;
        while (sibling) {
            let sibText = clean(sibling.innerText);
            if (sibText && sibText.length > 0 && sibText.length < 50 && /[a-zA-Z]/.test(sibText)) {
                return sibText;
            }
            sibling = sibling.previousElementSibling;
        }
        
        let parentSib = parent.previousElementSibling;
        while (parentSib) {
            let sibText = clean(parentSib.innerText);
            if (sibText && sibText.length > 0 && sibText.length < 50 && /[a-zA-Z]/.test(sibText)) {
                return sibText;
            }
            parentSib = parentSib.previousElementSibling;
        }
        
        if (parent.tagName.toLowerCase() === 'label') {
             let pText = clean(parent.innerText);
             if (pText && pText.length > 0 && pText.length < 50 && /[a-zA-Z]/.test(pText)) {
                 return pText;
             }
        }
        
        current = parent;
    }
    return '';
};
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    html_content = open("c:/Users/kavya/Desktop/text_extract/automation_proj/backend/debug_page_dump.html", "r", encoding="utf-8").read()
    page.set_content(html_content)
    page.evaluate(JS_RESOLVER_DEFINITION)
    
    inputs = page.query_selector_all("input")
    for idx, inp in enumerate(inputs):
        try:
            label = page.evaluate("(e) => window.resolveInputLabel(e)", inp)
            print(f"Input {idx} ({inp.get_attribute('id')}): {label}")
        except Exception as e:
            print(f"Error on {idx}: {e}")
    browser.close()
