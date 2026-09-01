import os
import re
from playwright.sync_api import sync_playwright
from typing import Dict, Any, List
from ..config import settings

def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
        
    return previous_row[-1]

JS_RESOLVER_DEFINITION = r"""
window.resolveInputLabel = (elem) => {
    if (!elem) return '';
    function clean(txt) {
        return txt ? txt.replace(/[\u200b\u200c\n]/g, '').replace(/\*$/, '').trim() : '';
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

JS_TABLE_GRID_HELPER = r"""
window.getTableGrid = () => {
    // 1. Check if there is a standard table on the page
    let tbody = document.querySelector("table tbody");
    if (tbody) {
        let trs = Array.from(tbody.querySelectorAll("tr"));
        // Sort rows by vertical position
        trs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        
        // Find header elements in the table
        let headers = Array.from(document.querySelectorAll("table thead th, table thead td, table tr:first-child th"));
        if (headers.length === 0) {
            headers = Array.from(document.querySelectorAll("table th"));
        }
        let headersInfo = headers.map(h => {
            let rect = h.getBoundingClientRect();
            return { text: h.innerText.trim(), x: rect.left + rect.width / 2 };
        }).filter(h => h.text);
        
        let rowsCount = trs.length;
        let columnMapping = [];
        
        trs.forEach((tr, rIdx) => {
            let rowInputs = Array.from(tr.querySelectorAll("input, select, textarea")).filter(el => {
                let style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0) return false;
                if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
                return true;
            });
            
            // Sort inputs in row from left to right
            rowInputs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            
            rowInputs.forEach((inp, cIdx) => {
                let inpX = inp.getBoundingClientRect().left + inp.getBoundingClientRect().width / 2;
                // Find closest header
                let closestHeader = null;
                let minDist = Infinity;
                headersInfo.forEach(h => {
                    let dist = Math.abs(inpX - h.x);
                    if (dist < minDist) {
                        minDist = dist;
                        closestHeader = h.text;
                    }
                });
                
                inp.setAttribute("data-autofill-row", rIdx);
                inp.setAttribute("data-autofill-col", cIdx);
                inp.setAttribute("data-autofill-header", closestHeader || "");
                
                if (rIdx === 0) {
                    columnMapping.push(closestHeader || "");
                }
            });
        });
        
        return {
            rowsCount: rowsCount,
            columns: columnMapping
        };
    }
    
    // 2. Fallback: Coordinate-based Y-clustering for custom div-based grids
    let inputs = Array.from(document.querySelectorAll("input, textarea, select")).filter(el => {
        let style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0) return false;
        if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
        return true;
    });

    let groups = [];
    inputs.forEach(inp => {
        let rect = inp.getBoundingClientRect();
        let y = rect.top + rect.height / 2;
        let x = rect.left + rect.width / 2;
        
        let foundGroup = groups.find(g => Math.abs(g.y - y) < 15);
        if (foundGroup) {
            foundGroup.inputs.push({ element: inp, x, rect });
        } else {
            groups.push({ y, inputs: [{ element: inp, x, rect }] });
        }
    });

    let headerTexts = ["Ref No.", "Material Type", "Purity", "Material Price/g", "Category", "Sub Category", "Type", "Quantity", "Total Wt in g", "Bag Wt in g", "Gross Wt in g", "Stone Wt in g", "Others", "Others Wt in g", "Others Value", "Net Wt in g", "Purchase Rate", "Stone Rate", "Making Charge", "Rate Per g", "Total Amount"];
    let headersInfo = [];
    let allEls = Array.from(document.querySelectorAll("div, span, th, p, label"));
    headerTexts.forEach(txt => {
        let match = allEls.find(el => el.innerText && el.innerText.trim() === txt);
        if (match) {
            let rect = match.getBoundingClientRect();
            headersInfo.push({ text: txt, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }
    });

    let tableTopY = headersInfo.length > 0 ? Math.min(...headersInfo.map(h => h.y)) : 0;
    headersInfo.sort((a, b) => a.x - b.x);

    let rowGroups = groups.filter(g => g.y > tableTopY && g.inputs.length >= 3);
    rowGroups.sort((a, b) => a.y - b.y);
    rowGroups.forEach(g => {
        g.inputs.sort((a, b) => a.x - b.x);
    });

    if (rowGroups.length === 0) return { rowsCount: 0, columns: [] };
    
    let firstRow = rowGroups[0];
    let columnMapping = firstRow.inputs.map(inp => {
        let closestHeader = null;
        let minDist = Infinity;
        headersInfo.forEach(h => {
            let dist = Math.abs(inp.x - h.x);
            if (dist < minDist) {
                minDist = dist;
                closestHeader = h.text;
            }
        });
        return closestHeader || "";
    });

    rowGroups.forEach((g, rIdx) => {
        g.inputs.forEach((inp, cIdx) => {
            inp.element.setAttribute("data-autofill-row", rIdx);
            inp.element.setAttribute("data-autofill-col", cIdx);
            inp.element.setAttribute("data-autofill-header", columnMapping[cIdx] || "");
        });
    });

    return {
        rowsCount: rowGroups.length,
        columns: columnMapping
    };
};
"""



class PlaywrightAutomationEngine:
    def __init__(self):
        self.headless = settings.PLAYWRIGHT_HEADLESS

    def _fill_interactive_element(self, page, elem, value) -> bool:
        try:
            tag_name = elem.evaluate("e => e.tagName.toLowerCase()")
            elem_type = elem.get_attribute("type") or ""
            class_attr = elem.get_attribute("class") or ""
            role_attr = elem.get_attribute("role") or ""
            
            if tag_name == "select":
                elem.select_option(value=str(value))
            elif elem_type in ("checkbox", "radio"):
                val_str = str(value).lower()
                if val_str not in ("false", "no", "unchecked", "0", ""):
                    elem.check(force=True)
            elif role_attr == "combobox" or "MuiAutocomplete-input" in class_attr:
                print(f"Handling MUI Autocomplete with value '{value}'")
                elem.click(force=True)
                page.wait_for_timeout(500)
                
                # Try to force open by typing the first few chars if options don't appear
                try:
                    page.wait_for_selector("li[role='option'], .MuiAutocomplete-option", timeout=1000)
                except Exception:
                    elem.fill("")
                    page.keyboard.type(str(value)[:4], delay=100)
                    page.wait_for_timeout(1000)

                # Case-insensitive, space-insensitive, and fuzzy option matching
                try:
                    page.wait_for_selector("li[role='option'], .MuiAutocomplete-option", timeout=2000)
                    option_locator = page.locator("li[role='option'], .MuiAutocomplete-option")
                    count = option_locator.count()
                    matched = False
                    
                    val_norm = re.sub(r'[^a-z0-9]', '', str(value).lower())
                    
                    # 1. Try exact normalized match
                    for idx in range(count):
                        opt = option_locator.nth(idx)
                        opt_text = opt.inner_text().strip()
                        opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                        if opt_norm == val_norm:
                            opt.click()
                            print(f"Found exact normalized match for '{value}': '{opt_text}'")
                            matched = True
                            break
                            
                    # 2. Try substring match
                    if not matched:
                        for idx in range(count):
                            opt = option_locator.nth(idx)
                            opt_text = opt.inner_text().strip()
                            opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                            if val_norm in opt_norm or opt_norm in val_norm:
                                opt.click()
                                print(f"Found substring match for '{value}': '{opt_text}'")
                                matched = True
                                break
                                
                    # 3. Try fuzzy Levenshtein match (threshold >= 65%)
                    if not matched:
                        best_opt = None
                        best_sim = 0.0
                        best_text = ""
                        for idx in range(count):
                            opt = option_locator.nth(idx)
                            opt_text = opt.inner_text().strip()
                            opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                            
                            dist = levenshtein_distance(val_norm, opt_norm)
                            max_len = max(len(val_norm), len(opt_norm))
                            sim = 1.0 - (dist / max_len) if max_len > 0 else 0.0
                            
                            if sim > best_sim:
                                best_sim = sim
                                best_opt = opt
                                best_text = opt_text
                                
                        if best_sim >= 0.65:
                            best_opt.click()
                            print(f"Found fuzzy match for '{value}': '{best_text}' (similarity: {best_sim:.2f})")
                            matched = True
                            
                    if not matched:
                        # Fallback: type the value to filter
                        print(f"No match in open list. Typing value '{value}' to filter...")
                        elem.fill(str(value))
                        page.wait_for_timeout(500)
                        
                        try:
                            page.wait_for_selector("li[role='option'], .MuiAutocomplete-option", timeout=1500)
                            option_locator = page.locator("li[role='option'], .MuiAutocomplete-option")
                            count = option_locator.count()
                            if count > 0:
                                for idx in range(count):
                                    opt = option_locator.nth(idx)
                                    opt_text = opt.inner_text().strip()
                                    opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                                    
                                    dist = levenshtein_distance(val_norm, opt_norm)
                                    max_len = max(len(val_norm), len(opt_norm))
                                    sim = 1.0 - (dist / max_len) if max_len > 0 else 0.0
                                    
                                    if opt_norm == val_norm or val_norm in opt_norm or opt_norm in val_norm or sim >= 0.65:
                                        opt.click()
                                        print(f"Clicked filtered option matching '{value}': '{opt_text}'")
                                        matched = True
                                        break
                                if not matched:
                                    option_locator.first.click()
                                    print(f"Clicked first filtered option for '{value}'")
                                    matched = True
                            else:
                                raise Exception("No options after filtering")
                        except Exception:
                            # Clear the input to reset filter list, and select the first available option
                            print(f"No options match '{value}'. Resetting combobox and selecting first option...")
                            elem.fill("")
                            page.wait_for_timeout(300)
                            # Wait for options to appear under empty filter
                            page.wait_for_selector("li[role='option'], .MuiAutocomplete-option", timeout=1500)
                            options = page.locator("li[role='option'], .MuiAutocomplete-option")
                            if options.count() > 0:
                                options.first.click()
                                print(f"Selected first option: '{options.first.inner_text().strip()}'")
                                matched = True
                            else:
                                page.keyboard.press("Enter")
                except Exception as autocomplete_err:
                    print(f"Autocomplete option selection failed: {autocomplete_err}. Trying simple fill fallback...")
                    elem.fill(str(value))
                    page.wait_for_timeout(300)
                    page.keyboard.press("Enter")
                    
                # If we filled country or state, wait for cascading sub-options to load
                if "country" in str(value).lower() or "state" in str(value).lower():
                    print("Waiting for dynamic sub-options to load...")
                    page.wait_for_timeout(1000)
            else:
                elem.click(force=True)
                elem.fill("")
                page.keyboard.type(str(value), delay=50)
                page.keyboard.press("Escape") # Close any datepicker or dropdown popups
            return True
        except Exception as e:
            print(f"Error filling element: {e}")
            return False

    def inspect_page_forms(self, url: str) -> List[Dict[str, Any]]:
        """
        Crawls a page and returns lists of inputs and interactive fields.
        Supports loading saved session state.
        """
        auth_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "auth.json")
        form_fields = []
        with sync_playwright() as p:
            has_auth = os.path.exists(auth_path)
            
            # Always run headed so the user can see it
            run_headless = False
            browser = p.chromium.launch(headless=run_headless)
            
            if has_auth:
                print(f"Loading saved session cookies for crawl from {auth_path}")
                context = browser.new_context(storage_state=auth_path)
            else:
                context = browser.new_context()
                
            page = context.new_page()
            try:
                page.goto(url, wait_until="load", timeout=20000)
            except Exception as e:
                print(f"Navigation warning: {e}. Trying to parse load state.")
                
            # Perform login handling (includes headed relaunch and wait loops)
            browser, context, page = self._handle_login_flow(p, browser, context, page, url, auth_path, run_headless)
                
            # If a module name is provided (from Master Orchestrator), try to navigate to it via sidebar click
            if module_name:
                try:
                    print(f"Attempting to navigate to module '{module_name}' via UI click...")
                    # Let UI settle first
                    page.wait_for_timeout(2000)
                    
                    # Look for a link or button that matches the sheet name (case-insensitive loosely)
                    # Use get_by_role('link', name=...) or get_by_text
                    target_locator = page.get_by_text(module_name, exact=False).first
                    target_locator.click(timeout=5000)
                    print(f"Clicked on module '{module_name}'. Waiting for network idle...")
                    page.wait_for_load_state("networkidle", timeout=5000)
                except Exception as e:
                    print(f"Warning: Could not automatically navigate to module '{module_name}' via click: {e}")

            # Wait for inputs to render
            try:
                page.wait_for_selector("input, textarea, select", timeout=15000)
            except Exception:
                pass
                
            # DUMP HTML FOR DEBUGGING
            try:
                html_content = page.content()
                with open("debug_page_dump.html", "w", encoding="utf-8") as f:
                    f.write(html_content)
                print(f"Dumped page HTML to debug_page_dump.html (URL: {url})")
            except Exception as e:
                print(f"Failed to dump HTML: {e}")
                
            # Inject resolveInputLabel function
            page.evaluate(JS_RESOLVER_DEFINITION)
            
            # Scan standard text inputs, textareas, checkboxes, selects
            elements = page.query_selector_all("input, textarea, select")
            print(f"DEBUG: Found {len(elements)} elements on the page.")
            
            for index, elem in enumerate(elements):
                try:
                    elem_type = elem.get_attribute("type") or "text"
                    elem_name = elem.get_attribute("name") or ""
                    elem_id = elem.get_attribute("id") or ""
                    elem_placeholder = elem.get_attribute("placeholder") or ""
                    
                    # Exclude hidden, submit, buttons, password
                    if elem_type in ("hidden", "submit", "button", "image", "password"):
                        continue
                        
                    # Skip disabled elements
                    is_disabled = elem.is_disabled() or elem.evaluate("el => el.disabled") or elem.evaluate("el => el.classList.contains('Mui-disabled')")
                    if is_disabled:
                        continue
                        
                    # Resolve label using custom JS function
                    label_text = page.evaluate("window.resolveInputLabel", elem)
                    label_text = label_text.strip()
                    
                    # Clean/Fallback label text if empty
                    if not label_text:
                        label_text = page.evaluate(
                            "(elem) => {"
                            "  let parent = elem.parentElement;"
                            "  if (!parent) return '';"
                            "  return parent.innerText.replace(elem.innerText, '').trim().split('\\n')[0];"
                            "}",
                            elem
                        )
                        label_text = label_text.replace('\u200b', '').replace('\u200c', '').strip().rstrip(":")
                    
                    # Customer Code is now allowed to be extracted
                        
                    # Skip Rate selector
                    if label_text.lower() in ("gold & silver rate", "rate"):
                        continue
                    
                    # Generate dynamic label selector or fallback CSS Selector
                    selector = ""
                    if label_text:
                        selector = f"label:{label_text}"
                    elif elem_id:
                        selector = f"#{elem_id}"
                    elif elem_name:
                        selector = f"input[name='{elem_name}'], textarea[name='{elem_name}'], select[name='{elem_name}']"
                    else:
                        tag = elem.evaluate("(e) => e.tagName.toLowerCase()")
                        selector = f"{tag}:nth-of-type({index + 1})"

                    form_fields.append({
                        "id": elem_id,
                        "name": elem_name,
                        "type": elem_type,
                        "placeholder": elem_placeholder,
                        "label": label_text or elem_name or elem_id,
                        "selector": selector
                    })
                except Exception as e:
                    print(f"DEBUG: Exception extracting element {index}: {e}")
                    pass
                
            browser.close()
        return form_fields

    def _verify_submission_success(self, page, original_url) -> tuple[bool, str]:
        """
        Verifies if the form submission succeeded by checking for redirects,
        success alerts, or validation error messages on the screen.
        """
        try:
            # 1. Check if the URL has changed (redirected to list or dashboard)
            current_url = page.url
            if current_url != original_url:
                print(f"Submission verified: Redirected to {current_url}")
                return True, ""
                
            # 1.5. Check if our MutationObserver caught a fleeting toast right after clicking submit
            captured_err = page.evaluate("window.__capturedError || null")
            if captured_err:
                print(f"Verification caught fleeting error via Observer: '{captured_err}'")
                # Try to clean up observer
                page.evaluate("if(window.__toastObserver) { window.__toastObserver.disconnect(); }")
                return False, f"Form submission failed: {captured_err}"
                
            captured_succ = page.evaluate("window.__capturedSuccess || null")
            if captured_succ:
                print(f"Verification caught fleeting success via Observer: '{captured_succ}'")
                page.evaluate("if(window.__toastObserver) { window.__toastObserver.disconnect(); }")
                return True, ""
                
            # Try to clean up observer anyway
            page.evaluate("if(window.__toastObserver) { window.__toastObserver.disconnect(); }")
                
            # 2. Check for explicit success toast notifications or alerts
            success_msg = page.evaluate("""() => {
                let successEls = Array.from(document.querySelectorAll(".MuiAlert-message, .toast, .notification, .alert-success, div"));
                for (let el of successEls) {
                    if (el.innerText) {
                        let txt = el.innerText.toLowerCase();
                        if ((txt.includes("success") || txt.includes("created") || txt.includes("saved") || txt.includes("successfully")) && txt.length < 150) {
                            return el.innerText;
                        }
                    }
                }
                return null;
            }""")
            if success_msg:
                print(f"Submission verified: Success message detected: '{success_msg}'")
                return True, ""
                
            # 3. Check for explicit validation/submission error messages on screen
            error_msg = page.evaluate("""() => {
                // First check explicit error classes and toast classes
                let errorEls = Array.from(document.querySelectorAll(".Mui-error, .error, .invalid-feedback, .error-message, .alert-danger, .MuiAlert-message, .toast, .notification"));
                
                let visibleErrors = errorEls.filter(el => {
                    let style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.innerText.trim() !== "";
                });
                
                if (visibleErrors.length > 0) {
                    let errTexts = visibleErrors.map(el => el.innerText.trim()).filter(Boolean);
                    
                    // Filter out actual success messages
                    let trueErrors = errTexts.filter(txt => {
                        let t = txt.toLowerCase();
                        if (t.includes("success") || t.includes("created") || t.includes("saved") || t.includes("successfully")) {
                            return false;
                        }
                        return true;
                    });
                    
                    let uniq = Array.from(new Set(trueErrors));
                    if (uniq.length > 0) {
                        return uniq.join("; ");
                    }
                }
                
                // If no explicit error classes caught it, scan ALL visible divs/spans for explicit error keywords
                // (This catches poorly-coded ERPs that throw toasts in random divs)
                let allEls = Array.from(document.querySelectorAll("div, span, p"));
                for (let el of allEls) {
                    let txt = (el.innerText || "").toLowerCase().trim();
                    if (txt.length > 5 && txt.length < 150) { // Toasts are usually short
                        let style = window.getComputedStyle(el);
                        if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0) {
                            // Check for strict explicit error keywords
                            if (txt.includes("already exist") || txt.includes("already taken") || 
                                txt.includes("already present") || txt.includes("duplicate") || 
                                txt.includes("has been taken") || txt.includes("already in use") ||
                                (txt.includes("exists") && !txt.includes("does not"))) {
                                return el.innerText.trim(); // Found it!
                            }
                        }
                    }
                }
                
                // Check if any required field has aria-invalid=\"true\"
                let invalidInput = document.querySelector("input[aria-invalid='true'], select[aria-invalid='true'], textarea[aria-invalid='true']");
                if (invalidInput) {
                    return "Required fields are invalid or missing.";
                }
                return null;
            }""")
            
            if error_msg:
                return False, f"Form submission failed: {error_msg}"
                
            # 4. Default fallback: If no errors are found, assume success!
            return True, ""
        except Exception as ex:
            print(f"Verification warning: {ex}")
            return True, ""
            
    def _perform_auto_login(self, page: Any) -> bool:
        """
        Attempts to perform programmatic auto-login if password field is visible.
        Returns True if login was attempted.
        """
        has_password = page.query_selector("input[type='password']") is not None
        if has_password:
            print("Login page detected. Performing programmatic auto-login...")
            try:
                # Find email/username field
                email_field = page.locator("input[type='email'], input[placeholder*='Email'], input[name*='email'], input").first
                if email_field and email_field.is_visible():
                    email_field.fill("kavya.psgtech@gmail.com")
                    
                # Find password field
                pass_field = page.locator("input[type='password']").first
                if pass_field and pass_field.is_visible():
                    pass_field.fill("Kavya@2005")
                    
                # Find submit button
                submit_btn = page.locator("button[type='submit'], button:has-text('Login'), button:has-text('Sign In')").first
                if submit_btn and submit_btn.is_visible():
                    submit_btn.click()
                    print("Login button clicked. Waiting for form to load...")
                    page.wait_for_timeout(5000)
                    return True
            except Exception as login_ex:
                print(f"Auto-login exception: {login_ex}")
        return False


    def _handle_login_flow(self, p: Any, browser: Any, context: Any, page: Any, url: str, auth_path: str, run_headless: bool) -> tuple[Any, Any, Any]:
        """
        Ensures the user is authenticated. If a login page is detected, relaunch headed if headless
        and wait up to 180 seconds for the user to log in manually and for the target form to load.
        """
        # Wait up to 4 seconds for any input to appear
        try:
            page.wait_for_selector("input:not([type='hidden']), textarea, select", timeout=4000)
        except Exception:
            pass

        # Check if it's the login page
        inputs_count = len(page.query_selector_all("input:not([type='hidden']), textarea, select"))
        has_password = page.query_selector("input[type='password']") is not None
        
        # If there is a password field or the URL implies login, we are on a login page
        is_login_page = has_password or "login" in page.url.lower()
        
        if is_login_page:
            print("Login page detected. Initiating authentication flow...")
            
            # Try programmatic auto-login first as a quick fallback helper
            self._perform_auto_login(page)
            
            # Recheck if still on login page
            inputs_count = len(page.query_selector_all("input:not([type='hidden']), textarea, select"))
            has_password = page.query_selector("input[type='password']") is not None
            still_on_login = has_password or "login" in page.url.lower()
            
            if still_on_login:
                if run_headless:
                    print("Relaunching browser in headed mode to allow manual login...")
                    page.close()
                    context.close()
                    browser.close()
                    
                    # Launch headed browser
                    browser = p.chromium.launch(headless=False)
                    context = browser.new_context()
                    page = context.new_page()
                    try:
                        page.goto(url, wait_until="load", timeout=40000)
                    except Exception as e:
                        print(f"Page load warning on relaunch: {e}")
                        
                    # Quick auto-login retry on headed instance
                    self._perform_auto_login(page)
                
                print("--------------------------------------------------------------------------------")
                print("ACTION REQUIRED: Please log in manually in the browser window.")
                print("Solve any CAPTCHAs, OTPs, or enter your credentials.")
                print("The system will automatically resume once the form is loaded.")
                print("--------------------------------------------------------------------------------")
                
                # Wait up to 180 seconds for manual login
                logged_in = False
                for sec in range(180):
                    page.wait_for_timeout(1000)
                    has_password = page.query_selector("input[type='password']") is not None
                    is_login_url = "login" in page.url.lower()
                    
                    if not has_password and not is_login_url:
                        logged_in = True
                        print("Authentication successful! Left the login page.")
                        break
                    if (sec + 1) % 10 == 0:
                        print(f"Waiting for manual login... ({sec + 1}/180 seconds elapsed)")
                
                if not logged_in:
                    print("Timeout waiting for manual login.")
            
            # Save the cookies/session state
            context.storage_state(path=auth_path)
            print(f"Successfully saved authenticated session state to: {auth_path}")
            
        return browser, context, page

    def fill_form(
        self, 
        url: str, 
        extracted_data: Dict[str, Any], 
        mapping_engine: Any, 
        db: Any, 
        screenshot_path: str,
        auth_cookies: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Navigates to url, logs in if needed, scans form fields, maps them dynamically, 
        fills values using Playwright, and takes a verification screenshot.
        """
        result = {"success": True, "filled": [], "errors": [], "mappings": {}}
        
        # Store the login session state in the project root directory
        auth_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "auth.json")
        
        with sync_playwright() as p:
            # Check if we have a saved session state
            has_auth = os.path.exists(auth_path)
            
            # Always run in headed mode so the user can see the automation filling process
            run_headless = False
            browser = p.chromium.launch(headless=run_headless)
            
            if has_auth:
                print(f"Loading saved session state from {auth_path}...")
                context = browser.new_context(storage_state=auth_path)
            else:
                print("No active login session state found on disk. Launching browser...")
                context = browser.new_context()
                
            if auth_cookies:
                print(f"Injecting {len(auth_cookies)} authentication cookies into the browser context...")
                context.add_cookies(auth_cookies)
                
            page = context.new_page()
            
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                print(f"Initial page load warning: {e}")
                
            # Perform login handling (includes headed relaunch and wait loops)
            browser, context, page = self._handle_login_flow(p, browser, context, page, url, auth_path, run_headless)

            # --- Now we are logged in. Let's Crawl the Form Fields ---
            # Wait for the form inputs to render dynamically
            print("Waiting for form inputs to render...")
            for _ in range(15):
                inputs = page.query_selector_all("input:not([type='hidden']), textarea, select")
                if len(inputs) > 2:
                    break
                page.wait_for_timeout(500)

            # Inject resolveInputLabel function
            page.evaluate(JS_RESOLVER_DEFINITION)
            
            print("Scanning page inputs...")
            elements = page.query_selector_all("input, textarea, select")
            form_fields = []
            
            for index, elem in enumerate(elements):
                try:
                    elem_type = elem.get_attribute("type") or "text"
                    elem_name = elem.get_attribute("name") or ""
                    elem_id = elem.get_attribute("id") or ""
                    elem_placeholder = elem.get_attribute("placeholder") or ""
                    
                    if elem_type in ("hidden", "submit", "button", "image", "radio", "password"):
                        continue
                        
                    # Skip disabled elements
                    is_disabled = elem.is_disabled() or elem.evaluate("el => el.disabled") or elem.evaluate("el => el.classList.contains('Mui-disabled')")
                    if is_disabled:
                        continue
                        
                    # Resolve label using custom JS function
                    label_text = page.evaluate("window.resolveInputLabel", elem)
                    label_text = label_text.strip()
                    
                    # Clean/Fallback label text if empty
                    if not label_text:
                        label_text = page.evaluate(
                            "(elem) => {"
                            "  let parent = elem.parentElement;"
                            "  if (!parent) return '';"
                            "  return parent.innerText.replace(elem.innerText, '').trim().split('\\n')[0];"
                            "}",
                            elem
                        )
                        label_text = label_text.replace('\u200b', '').replace('\u200c', '').strip().rstrip(":")
                    
                    # Skip Customer Code completely
                    if label_text.lower() in ("customer code", "customercode"):
                        continue
                        
                    # Skip Rate selector
                    if label_text.lower() in ("gold & silver rate", "rate"):
                        continue

                    # Generate dynamic label selector or fallback CSS Selector
                    selector = ""
                    if label_text:
                        selector = f"label:{label_text}"
                    elif elem_id:
                        selector = f"#{elem_id}"
                    elif elem_name:
                        selector = f"input[name='{elem_name}'], textarea[name='{elem_name}'], select[name='{elem_name}']"
                    else:
                        tag = elem.evaluate("(e) => e.tagName.toLowerCase()")
                        selector = f"{tag}:nth-of-type({index + 1})"

                    form_fields.append({
                        "id": elem_id,
                        "name": elem_name,
                        "type": elem_type,
                        "placeholder": elem_placeholder,
                        "label": label_text or elem_name or elem_id,
                        "selector": selector
                    })
                except Exception:
                    pass

            if not form_fields:
                result["success"] = False
                result["errors"].append("No input fields found on target website after login.")
                browser.close()
                return result

            # --- Separate flat headers and records ---
            flat_headers = {k: v for k, v in extracted_data.items() if k != "records"}
            table_records = extracted_data.get("records", [])

            # --- Map the Fields ---
            print("Mapping document fields to web inputs...")
            mapped_selectors = mapping_engine.map_fields(flat_headers, form_fields, db)
            result["mappings"] = mapped_selectors

            if not mapped_selectors and not table_records:
                result["success"] = False
                result["errors"].append("No matching fields could be semantically aligned.")
                browser.close()
                return result

            # --- Fill Flat Header Fields ---
            print("Filling flat header fields...")
            # Sort selectors to handle cascading dropdowns (Country -> State -> District -> others)
            def get_fill_priority(sel):
                sel_lower = sel.lower()
                if "country" in sel_lower: return 1
                if "state" in sel_lower: return 2
                if "district" in sel_lower or "city" in sel_lower: return 3
                return 4
                
            sorted_selectors = sorted(mapped_selectors.items(), key=lambda x: get_fill_priority(x[0]))
            
            for selector, value in sorted_selectors:
                if not value:
                    continue
                
                # Clean mobile numbers
                selector_lower = selector.lower()
                if any(kw in selector_lower for kw in ["mobile", "phone", "contact", "tel"]):
                    if isinstance(value, str):
                        cleaned_val = value.strip()
                        if cleaned_val.startswith("+91"):
                            cleaned_val = cleaned_val[3:].strip()
                        elif cleaned_val.startswith("91") and len(cleaned_val) > 10:
                            cleaned_val = cleaned_val[2:].strip()
                        # Keep only digits
                        cleaned_val = "".join(c for c in cleaned_val if c.isdigit())
                        value = cleaned_val
                try:
                    elem = None
                    if selector.startswith("label:"):
                        label_name = selector.split(":", 1)[1]
                        elem_handle = page.evaluate_handle(
                            """(labelName) => {
                                let inputs = document.querySelectorAll("input, textarea, select");
                                for (let elem of inputs) {
                                    if (window.resolveInputLabel(elem).toLowerCase() === labelName.toLowerCase()) {
                                        return elem;
                                    }
                                }
                                return null;
                            }""",
                            label_name
                        )
                        if elem_handle and elem_handle.as_element():
                            elem = elem_handle.as_element()
                    else:
                        elem = page.wait_for_selector(selector, timeout=5000)
                        
                    if elem:
                        success = self._fill_interactive_element(page, elem, value)
                        if success:
                            result["filled"].append(selector)
                except Exception as ex:
                    err_msg = f"Failed to fill selector '{selector}': {str(ex)}"
                    print(err_msg)
                    result["errors"].append(err_msg)

            # --- Fill Table Records (Tabular Row Items) ---
            if table_records:
                print(f"Detected {len(table_records)} table records. Starting multi-row filling...")
                
                # Inject JS Table Grid Helper
                page.evaluate(JS_TABLE_GRID_HELPER)
                
                for r_idx, rec in enumerate(table_records):
                    print(f"Filling table row {r_idx + 1}/{len(table_records)}")
                    
                    # 1. Check if row exists, if not click Add Row button
                    grid_status = page.evaluate("window.getTableGrid()")
                    current_rows = grid_status.get("rowsCount", 0)
                    
                    if r_idx >= current_rows:
                        # Click Add Row button
                        print(f"Row {r_idx} doesn't exist. Clicking Add Row button...")
                        clicked = False
                        
                        # List of potential selectors for Add Row button
                        # button.css-pvno25 is the verified star icon button that adds a row on this site!
                        selectors = [
                            "button.css-pvno25",
                            "button:has(svg[data-testid='AddIcon'])",
                            "svg[data-testid='AddIcon']",
                            "button.css-xz9haa",
                            "button:has(svg)"
                        ]
                        
                        for sel in selectors:
                            add_btn = page.locator(sel).first
                            if add_btn and add_btn.is_visible():
                                print(f"Trying to click Add Row button with selector: {sel}")
                                try:
                                    # Click programmatically using evaluate to bypass interception/overlays
                                    add_btn.evaluate("el => el.click()")
                                    page.wait_for_timeout(2000)
                                    # Re-run grid helper to update DOM attributes
                                    grid_status = page.evaluate("window.getTableGrid()")
                                    current_rows = grid_status.get("rowsCount", 0)
                                    print(f"Rows count after click: {current_rows}")
                                    if current_rows > r_idx:
                                        clicked = True
                                        break
                                except Exception as e:
                                    print(f"Error clicking selector {sel}: {e}")
                                    
                        if not clicked:
                            print("Add Row button (+) not found, not visible, or failed to increase row count!")
                            result["errors"].append("Could not add new table row because Add Row button is missing or unresponsive.")
                            break
                            
                    # 2. Fill each input in the row matching our record keys
                    row_inputs = page.query_selector_all(f"input[data-autofill-row='{r_idx}'], select[data-autofill-row='{r_idx}'], textarea[data-autofill-row='{r_idx}']")
                    print(f"Found {len(row_inputs)} inputs for row {r_idx}")
                    
                    for elem in row_inputs:
                        # Check if element is disabled
                        is_disabled = elem.is_disabled() or elem.evaluate("el => el.disabled") or elem.evaluate("el => el.classList.contains('Mui-disabled')")
                        if is_disabled:
                            continue
                            
                        # Retrieve column header
                        header_label = elem.get_attribute("data-autofill-header") or ""
                        if not header_label:
                            continue
                            
                        # Clean column header to key
                        clean_col = re.sub(r'[^a-zA-Z0-9\s_]', '', header_label).strip().lower()
                        
                        # Match to standard keys
                        matched_key = None
                        if "ref no" in clean_col or "ref_no" in clean_col or clean_col == "ref":
                            matched_key = "ref_no"
                        elif "material type" in clean_col:
                            matched_key = "material_type"
                        elif "purity" in clean_col:
                            matched_key = "purity"
                        elif "price" in clean_col:
                            matched_key = "material_price_g"
                        elif "category" in clean_col and "sub" not in clean_col:
                            matched_key = "category"
                        elif "sub category" in clean_col or "subcategory" in clean_col:
                            matched_key = "sub_category"
                        elif "type" in clean_col:
                            matched_key = "type"
                        elif "quantity" in clean_col or "qty" in clean_col:
                            matched_key = "quantity"
                        elif "gross" in clean_col:
                            matched_key = "gross_weight"
                        elif "net" in clean_col:
                            matched_key = "net_weight"
                        elif "stone wt" in clean_col:
                            matched_key = "stone_weight"
                        elif "others wt" in clean_col:
                            matched_key = "others_wt"
                        elif "others value" in clean_col:
                            matched_key = "others_value"
                        elif "others" in clean_col:
                            matched_key = "others"
                        elif "purchase rate" in clean_col:
                            matched_key = "purchase_rate"
                        elif "stone rate" in clean_col:
                            matched_key = "stone_rate"
                        elif "making charge" in clean_col:
                            matched_key = "making_charges"
                        elif "rate per g" in clean_col or "rate per gram" in clean_col:
                            matched_key = "rate_per_gram"
                        elif "total wt" in clean_col:
                            # In target website, Col 9 is Total Wt in g, let's map it to gross_weight!
                            matched_key = "gross_weight"
                        elif "bag wt" in clean_col:
                            # Default bag weight can be 0
                            matched_key = "bag_weight"
                            
                        # If we have a matched key, check if it's in our record dictionary with aliases
                        val_to_fill = None
                        if matched_key:
                            aliases = [matched_key]
                            if matched_key == "material_price_g":
                                aliases.extend(["material_price_per_gram", "material_price_per_g", "material_price/g", "rate_per_gram"])
                            elif matched_key == "making_charges":
                                aliases.extend(["making_charge", "making charge", "making charges"])
                            elif matched_key == "others_wt":
                                aliases.extend(["others_wt_in_g", "other_wt_in_g", "other_weight", "others_weight"])
                            elif matched_key == "ref_no":
                                aliases.extend(["ref_no", "ref_no.", "ref no", "ref no.", "reference_id"])
                            elif matched_key == "gross_weight":
                                aliases.extend(["gross_weight", "gross_wt", "gross wt", "gross wt in g", "gross weight in g", "gross wt (g)", "total_wt_in_g", "total_weight"])
                            elif matched_key == "net_weight":
                                aliases.extend(["net_weight", "net_wt", "net wt", "net in g", "net_in_g", "net wt in g", "net weight in g", "net wt (g)"])
                            elif matched_key == "stone_weight":
                                aliases.extend(["stone_weight", "stone_wt", "stone wt", "stone wt in g", "stone_wt_in_g", "stone weight in g"])
                            
                            for alias in aliases:
                                if alias in rec:
                                    val_to_fill = rec[alias]
                                    break
                            
                            if val_to_fill is None and matched_key == "bag_weight":
                                val_to_fill = "0"
                            
                        if val_to_fill is not None and str(val_to_fill).strip() != "":
                            print(f"  Filling column '{header_label}' (key: {matched_key}) with value: '{val_to_fill}'")
                            self._fill_interactive_element(page, elem, val_to_fill)
                            result["filled"].append(f"row_{r_idx}_col_{header_label}")
            
            submit_selectors = [
                "button[type='submit']",
                "input[type='submit']",
                "#submit_btn",
                "#submit",
                ".btn-submit",
                "button:has-text('Submit')",
                "a:has-text('Submit')",
                "[role='button']:has-text('Submit')",
                ".btn:has-text('Submit')",
                "text='Submit'",
                "button:has-text('Confirm')",
                "button:has-text('Save')",
                "button:has-text('Create')"
            ]
            
            submit_clicked = False
            for sub_sel in submit_selectors:
                try:
                    elem = page.locator(sub_sel).first
                    if elem and elem.is_visible():
                        page.evaluate("""() => {
                            window.__capturedError = null;
                            window.__capturedSuccess = null;
                            window.__toastObserver = new MutationObserver((mutations) => {
                                for (let mut of mutations) {
                                    for (let node of mut.addedNodes) {
                                        if (node.nodeType === 1) { // ELEMENT_NODE
                                            let txt = (node.innerText || node.textContent || "").toLowerCase();
                                            if (txt.length > 5 && txt.length < 150) {
                                                if (txt.includes("already exist") || txt.includes("exists") || txt.includes("duplicate") || txt.includes("already taken") || txt.includes("registered") || txt.includes("failed")) {
                                                    window.__capturedError = (node.innerText || node.textContent).trim();
                                                } else if (txt.includes("success") || txt.includes("created") || txt.includes("saved") || txt.includes("successfully")) {
                                                    window.__capturedSuccess = (node.innerText || node.textContent).trim();
                                                }
                                            }
                                        }
                                    }
                                }
                            });
                            window.__toastObserver.observe(document.body, { childList: true, subtree: true });
                        }""")
                        elem.click(force=True)
                        submit_clicked = True
                        print(f"Auto-clicked submit button using selector: {sub_sel}")
                        break
                except Exception:
                    pass
            
            if submit_clicked:
                try:
                    page.wait_for_load_state("networkidle", timeout=5000)
                except Exception:
                    pass
                page.wait_for_timeout(4000)
                
                # Verify submission success
                success_status, err_msg = self._verify_submission_success(page, url)
                if not success_status:
                    result["success"] = False
                    result["errors"].append(err_msg)
            else:
                page.wait_for_timeout(1000)

            # Save screenshot
            os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
            page.screenshot(path=screenshot_path)
            browser.close()
            
        if len(result["errors"]) > 0:
            result["success"] = False
            
        return result

    def fill_form_bulk(
        self, 
        url: str, 
        records: List[Dict[str, Any]], 
        mapping_engine: Any, 
        db: Any, 
        screenshot_dir: str,
        auth_cookies: List[Dict[str, Any]] = None,
        module_name: str = None
    ) -> Dict[str, Any]:
        """
        Loops through all records, navigating to the form URL for each record,
        filling the fields, submitting the form, and repeating.
        """
        result = {"success": True, "results": [], "errors": []}
        auth_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "auth.json")
        
        with sync_playwright() as p:
            has_auth = os.path.exists(auth_path)
            run_headless = self.headless if has_auth else False
            browser = p.chromium.launch(headless=run_headless)
            
            if has_auth:
                print(f"Loading saved session state from {auth_path}...")
                context = browser.new_context(storage_state=auth_path)
            else:
                print("No active login session state found on disk. Launching browser...")
                context = browser.new_context()
                
            if auth_cookies:
                print(f"Injecting {len(auth_cookies)} authentication cookies into the browser context...")
                context.add_cookies(auth_cookies)
                
            page = context.new_page()
            
            # --- Check Login (Similar to single fill) ---
            try:
                page.goto(url, wait_until="load", timeout=30000)
            except Exception as e:
                print(f"Initial page load warning: {e}")
                
            # Perform login handling (includes headed relaunch and wait loops)
            browser, context, page = self._handle_login_flow(p, browser, context, page, url, auth_path, run_headless)

            cached_form_fields = None

            # --- Now we loop through the records ---
            for record_idx, record in enumerate(records):
                print(f"Bulk Autofill: Processing record {record_idx + 1}/{len(records)} ({record.get('full_name', 'Unnamed')})")
                
                # Navigate to the form URL for this record
                try:
                    page.goto(url, wait_until="load", timeout=30000)
                    
                    # --- Module UI Navigation ---
                    if module_name:
                        try:
                            print(f"Bulk Autofill: Navigating to module '{module_name}' via sidebar click...")
                            page.wait_for_timeout(1000)
                            target_locator = page.get_by_text(module_name, exact=False).first
                            target_locator.click(timeout=3000)
                            print(f"Clicked on module '{module_name}'. Waiting for network idle...")
                            try:
                                page.wait_for_load_state("networkidle", timeout=3000)
                            except Exception:
                                pass
                            
                            # Auto-click 'Create' or 'Add' button to open the form using robust JS
                            try:
                                print(f"Looking for 'Create' or 'Add' button in {module_name}...")
                                page.wait_for_timeout(1000)
                                clicked = page.evaluate('''() => {
                                    const buttons = Array.from(document.querySelectorAll("button, a, [role='button']"));
                                    const target = buttons.find(b => {
                                        const text = (b.innerText || b.textContent || "").toLowerCase();
                                        return text.includes("create") || text.includes("add") || text.includes("new");
                                    });
                                    if (target) {
                                        target.click();
                                        return true;
                                    }
                                    return false;
                                }''')
                                
                                if clicked:
                                    print("Clicked create/add button to open form via JS.")
                                    try:
                                        page.wait_for_load_state("networkidle", timeout=3000)
                                    except Exception:
                                        pass
                                    page.wait_for_timeout(500)
                                else:
                                    print("No explicit Create/Add button found via JS.")
                            except Exception as create_e:
                                print(f"Create/Add button JS click failed: {create_e}")

                        except Exception as nav_e:
                            print(f"Warning: Could not automatically navigate to module '{module_name}' via click: {nav_e}")

                    # Wait for form inputs to render
                    page.wait_for_selector("input:not([type='hidden']), textarea, select", timeout=10000)
                    
                    # Ensure more than 2 inputs have rendered dynamically (since the form loads fields asynchronously)
                    for _ in range(20):
                        inputs = page.query_selector_all("input:not([type='hidden']), textarea, select")
                        if len(inputs) > 2:
                            break
                        page.wait_for_timeout(200)
                except Exception as e:
                    err_msg = f"Failed to navigate to form for record {record_idx + 1}: {str(e)}"
                    result["results"].append({"record_index": record_idx, "success": False, "errors": [err_msg]})
                    result["errors"].append(err_msg)
                    continue

                # We must inject this on EVERY record because page.goto (reloads) erase injected window functions!
                page.evaluate(JS_RESOLVER_DEFINITION)

                if cached_form_fields is None:
                    print("First record: Scanning DOM to build Blueprint...")
                    
                    # Scan inputs
                    elements = page.query_selector_all("input, textarea, select")
                    form_fields = []
                    for index, elem in enumerate(elements):
                        try:
                            elem_type = elem.get_attribute("type") or "text"
                            elem_name = elem.get_attribute("name") or ""
                            elem_id = elem.get_attribute("id") or ""
                            elem_placeholder = elem.get_attribute("placeholder") or ""
                            
                            if elem_type in ("hidden", "submit", "button", "image", "radio", "password"):
                                continue
                                
                            # Skip disabled
                            is_disabled = elem.is_disabled() or elem.evaluate("el => el.disabled") or elem.evaluate("el => el.classList.contains('Mui-disabled')")
                            if is_disabled:
                                continue
                                
                            label_text = page.evaluate("window.resolveInputLabel", elem).strip()
                            if not label_text:
                                label_text = page.evaluate(
                                    "(elem) => { let parent = elem.parentElement; if (!parent) return ''; return parent.innerText.replace(elem.innerText, '').trim().split('\\n')[0]; }",
                                    elem
                                ).replace('\u200b', '').replace('\u200c', '').strip().rstrip(":")
                            
                            if label_text.lower() in ("customer code", "customercode", "gold & silver rate", "rate"):
                                continue
                                
                            selector = ""
                            if label_text:
                                selector = f"label:{label_text}"
                            elif elem_id:
                                selector = f"#{elem_id}"
                            elif elem_name:
                                selector = f"input[name='{elem_name}'], textarea[name='{elem_name}'], select[name='{elem_name}']"
                            else:
                                tag = elem.evaluate("(e) => e.tagName.toLowerCase()")
                                selector = f"{tag}:nth-of-type({index + 1})"

                            form_fields.append({
                                "id": elem_id,
                                "name": elem_name,
                                "type": elem_type,
                                "placeholder": elem_placeholder,
                                "label": label_text or elem_name or elem_id,
                                "selector": selector
                            })
                        except Exception:
                            pass
                    
                    cached_form_fields = form_fields
                    print(f"Blueprint created and cached with {len(cached_form_fields)} fields.")
                else:
                    form_fields = cached_form_fields
                    print("Re-using cached DOM Blueprint.")

                # Map fields
                mapped_selectors = mapping_engine.map_fields(record, form_fields, db)
                if not mapped_selectors:
                    err_msg = f"No matching fields aligned for record {record_idx + 1}."
                    result["results"].append({"record_index": record_idx, "success": False, "errors": [err_msg]})
                    result["errors"].append(err_msg)
                    continue

                # Fill fields
                # Sort selectors to handle cascading dropdowns (Country -> State -> District -> others)
                def get_fill_priority(sel):
                    sel_lower = sel.lower()
                    if "country" in sel_lower: return 1
                    if "state" in sel_lower: return 2
                    if "district" in sel_lower or "city" in sel_lower: return 3
                    return 4
                    
                sorted_selectors = sorted(mapped_selectors.items(), key=lambda x: get_fill_priority(x[0]))
                
                record_errors = []
                filled_selectors = []
                
                for selector, value in sorted_selectors:
                    if not value:
                        continue
                    
                    # Clean mobile numbers
                    selector_lower = selector.lower()
                    if any(kw in selector_lower for kw in ["mobile", "phone", "contact", "tel"]):
                        if isinstance(value, str):
                            cleaned_val = value.strip()
                            if cleaned_val.startswith("+91"):
                                cleaned_val = cleaned_val[3:].strip()
                            elif cleaned_val.startswith("91") and len(cleaned_val) > 10:
                                cleaned_val = cleaned_val[2:].strip()
                            cleaned_val = "".join(c for c in cleaned_val if c.isdigit())
                            value = cleaned_val
                    
                    try:
                        elem = None
                        if selector.startswith("label:"):
                            label_name = selector.split(":", 1)[1]
                            elem_handle = page.evaluate_handle(
                                """(labelName) => {
                                    let inputs = document.querySelectorAll("input, textarea, select");
                                    for (let elem of inputs) {
                                        if (window.resolveInputLabel(elem).toLowerCase() === labelName.toLowerCase()) {
                                            return elem;
                                        }
                                    }
                                    return null;
                                }""",
                                label_name
                            )
                            if elem_handle and elem_handle.as_element():
                                elem = elem_handle.as_element()
                        else:
                            elem = page.wait_for_selector(selector, timeout=5000)
                            
                        if elem:
                            tag_name = elem.evaluate("e => e.tagName.toLowerCase()")
                            elem_type = elem.get_attribute("type") or ""
                            class_attr = elem.get_attribute("class") or ""
                            role_attr = elem.get_attribute("role") or ""
                            
                            if tag_name == "select":
                                elem.select_option(value=value)
                            elif elem_type == "checkbox":
                                if value.lower() in ("true", "yes", "checked", "1"):
                                    elem.check()
                            elif role_attr == "combobox" or "MuiAutocomplete-input" in class_attr:
                                elem.click()
                                page.wait_for_timeout(300)
                                
                                matched = False
                                val_norm = re.sub(r'[^a-z0-9]', '', value.lower())
                                
                                try:
                                    page.wait_for_selector("li[role='option'], .MuiAutocomplete-option", timeout=2000)
                                    option_locator = page.locator("li[role='option'], .MuiAutocomplete-option")
                                    count = option_locator.count()
                                    
                                    # Exact match
                                    for idx in range(count):
                                        opt = option_locator.nth(idx)
                                        opt_text = opt.inner_text().strip()
                                        opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                                        if opt_norm == val_norm:
                                            opt.click()
                                            matched = True
                                            break
                                            
                                    # Substring match
                                    if not matched:
                                        for idx in range(count):
                                            opt = option_locator.nth(idx)
                                            opt_text = opt.inner_text().strip()
                                            opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                                            if val_norm in opt_norm or opt_norm in val_norm:
                                                opt.click()
                                                matched = True
                                                break
                                                
                                    # Fuzzy Levenshtein match
                                    if not matched:
                                        best_opt = None
                                        best_sim = 0.0
                                        best_text = ""
                                        for idx in range(count):
                                            opt = option_locator.nth(idx)
                                            opt_text = opt.inner_text().strip()
                                            opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                                            dist = levenshtein_distance(val_norm, opt_norm)
                                            max_len = max(len(val_norm), len(opt_norm))
                                            sim = 1.0 - (dist / max_len) if max_len > 0 else 0.0
                                            if sim > best_sim:
                                                best_sim = sim
                                                best_opt = opt
                                                best_text = opt_text
                                                
                                        if best_sim >= 0.65:
                                            best_opt.click()
                                            matched = True
                                except Exception:
                                    pass # Initial options didn't appear, proceed to fill manually
                                        
                                if not matched:
                                    elem.fill(value)
                                    page.wait_for_timeout(500)
                                    try:
                                        page.wait_for_selector("li[role='option'], .MuiAutocomplete-option", timeout=2500)
                                        option_locator = page.locator("li[role='option'], .MuiAutocomplete-option")
                                        count = option_locator.count()
                                        if count > 0:
                                            for idx in range(count):
                                                opt = option_locator.nth(idx)
                                                opt_text = opt.inner_text().strip()
                                                opt_norm = re.sub(r'[^a-z0-9]', '', opt_text.lower())
                                                dist = levenshtein_distance(val_norm, opt_norm)
                                                max_len = max(len(val_norm), len(opt_norm))
                                                sim = 1.0 - (dist / max_len) if max_len > 0 else 0.0
                                                if opt_norm == val_norm or val_norm in opt_norm or opt_norm in val_norm or sim >= 0.65:
                                                    opt.click()
                                                    matched = True
                                                    break
                                            if not matched:
                                                option_locator.first.click()
                                        else:
                                            page.keyboard.press("Enter")
                                    except Exception:
                                        page.keyboard.press("Enter")
                                
                                # Wait for dynamic sub-options
                                if "country" in selector_lower or "state" in selector_lower:
                                    page.wait_for_timeout(500)
                            else:
                                elem.click()
                                elem.fill("")
                                page.keyboard.type(value, delay=10) # Sped up typing
                                
                            filled_selectors.append(selector)
                    except Exception as ex:
                        record_errors.append(f"Failed to fill selector '{selector}': {str(ex)}")

                # --- Auto-click Create/Submit Button ---
                submit_selectors = [
                    "button[type='submit']",
                    "input[type='submit']",
                    "#submit_btn",
                    "#submit",
                    ".btn-submit",
                    "button:has-text('Submit')",
                    "button:has-text('Confirm')",
                    "button:has-text('Save')",
                    "button:has-text('Create')"
                ]
                submit_clicked = False
                for sub_sel in submit_selectors:
                    try:
                        elem = page.locator(sub_sel).first
                        if elem and elem.is_visible():
                            # Inject toast listener BEFORE clicking submit to catch fleeting toasts
                            page.evaluate("""() => {
                                window.__capturedError = null;
                                window.__capturedSuccess = null;
                                window.__toastObserver = new MutationObserver((mutations) => {
                                    for (let mut of mutations) {
                                        for (let node of mut.addedNodes) {
                                            if (node.nodeType === 1) { // ELEMENT_NODE
                                                let txt = (node.innerText || node.textContent || "").toLowerCase();
                                                if (txt.length > 5 && txt.length < 150) {
                                                    if (txt.includes("already exist") || txt.includes("exists") || txt.includes("duplicate") || txt.includes("already taken") || txt.includes("registered") || txt.includes("failed")) {
                                                        window.__capturedError = (node.innerText || node.textContent).trim();
                                                    } else if (txt.includes("success") || txt.includes("created") || txt.includes("saved") || txt.includes("successfully")) {
                                                        window.__capturedSuccess = (node.innerText || node.textContent).trim();
                                                    }
                                                }
                                            }
                                        }
                                    }
                                });
                                window.__toastObserver.observe(document.body, { childList: true, subtree: true });
                            }""")
                            
                            elem.click()
                            submit_clicked = True
                            print(f"Auto-clicked submit/create button for record {record_idx + 1}.")
                            break
                    except Exception:
                        pass
                
                if submit_clicked:
                    try:
                        page.wait_for_load_state("networkidle", timeout=3000)
                    except Exception:
                        pass
                    
                    # Dynamically wait for toast instead of hardcoded 4 seconds
                    try:
                        page.wait_for_selector(".MuiAlert-message, .toast, .notification, .alert-success, .Mui-error, .error, .invalid-feedback", timeout=3000)
                        page.wait_for_timeout(200) # tiny buffer for text to render
                    except Exception:
                        page.wait_for_timeout(1000) # fallback wait if no toast caught
                    
                    # Verify submission success
                    success_status, err_msg = self._verify_submission_success(page, url)
                    if not success_status:
                        record_errors.append(err_msg)
                else:
                    page.wait_for_timeout(500)

                # Capture verification screenshot of each record submission
                rec_screenshot_filename = f"screenshot_bulk_{record_idx}.png"
                rec_screenshot_path = os.path.join(screenshot_dir, rec_screenshot_filename)
                try:
                    page.screenshot(path=rec_screenshot_path)
                except Exception:
                    pass

                result["results"].append({
                    "record_index": record_idx,
                    "success": len(record_errors) == 0,
                    "filled_fields": filled_selectors,
                    "errors": record_errors
                })
                
            browser.close()
            
        return result

    def run_orchestrator_job(self, workbook_id: str, mapping_engine: Any, db: Any, base_url: str = None) -> Dict[str, Any]:
        """
        Executes automation for an entire multi-sheet workbook sequentially.
        Maintains a global memory to auto-fill dependent sheets (e.g., fetching 
        customer name based on phone number provided in the Saving Scheme sheet).
        """
        from ..models.orchestrator import Workbook, WorkbookSheet, AutomationJob, AutomationRecord, ExecutionLog
        import os
        import pandas as pd
        from ..config import settings
        
        # Fetch the workbook to get storage path
        workbook = db.query(Workbook).filter(Workbook.id == workbook_id).first()
        if not workbook:
            return {"success": False, "message": "Workbook not found"}

        # Load original excel data to append report column later
        try:
            excel_data = pd.read_excel(workbook.storage_path, sheet_name=None, dtype=str)
        except Exception as e:
            print(f"Error loading original Excel file for reporting: {e}")
            excel_data = {}

        # 1. Fetch all sheets in the workbook
        sheets = db.query(WorkbookSheet).filter(WorkbookSheet.workbook_id == workbook_id).all()
        if not sheets:
            return {"success": False, "message": "No sheets found in workbook"}
            
        results = {"success": True, "sheets_processed": 0, "logs": []}
        
        # Global memory to share data between sheets (Mentor's Cross-Sheet Auto-fill Idea)
        global_customer_cache = {}
        
        for sheet in sheets:
            # 2. Fetch the corresponding job
            job = db.query(AutomationJob).filter(AutomationJob.sheet_id == sheet.id).first()
            target_url = base_url or (job and job.target_url)
            if not target_url:
                msg = f"Skipping sheet '{sheet.sheet_name}' (No target URL configured)"
                print(msg)
                results["logs"].append(msg)
                continue
                
            job.status = "running"
            db.commit()
                
            # 3. Fetch all records for this job
            records = db.query(AutomationRecord).filter(AutomationRecord.job_id == job.id).order_by(AutomationRecord.row_index).all()
            if not records:
                continue
                
            print(f"Starting orchestration for sheet '{sheet.sheet_name}' with {len(records)} records...")
            
            # 4. Extract data in the format expected by fill_form_bulk
            record_dicts = [r.extracted_data for r in records]
            
            # 4.5. Cross-sheet Auto-fill (Relational Memory)
            for rec in record_dicts:
                unique_ids = []
                for k, v in rec.items():
                    clean_k = k.lower().replace(" ", "_").strip()
                    val_str = str(v).strip()
                    # Identify primary keys
                    if clean_k in ["mobile_number", "mobile", "phone", "phone_number", "contact_no", "email", "customer_code", "pan_no", "pan", "gstin", "gstin_no"] and len(val_str) > 3:
                        unique_ids.append(val_str)
                
                # Find if any of these IDs exist in our global memory
                matched_memory = None
                for uid in unique_ids:
                    if uid in global_customer_cache:
                        matched_memory = global_customer_cache[uid]
                        break
                
                if matched_memory:
                    # Enrich current record with missing data from memory
                    for mem_k, mem_v in matched_memory.items():
                        if (mem_k not in rec or not str(rec.get(mem_k, "")).strip()) and mem_v:
                            rec[mem_k] = mem_v
                
                # Update memory with the enriched record for ALL its unique IDs
                for uid in unique_ids:
                    if uid not in global_customer_cache:
                        global_customer_cache[uid] = {}
                    global_customer_cache[uid].update(rec)
            
            screenshot_dir = os.path.join(settings.UPLOAD_DIR, "screenshots", "orchestrator", workbook_id, sheet.sheet_name)
            os.makedirs(screenshot_dir, exist_ok=True)
            
            # Execute bulk fill for this sheet
            try:
                sheet_res = self.fill_form_bulk(
                    url=target_url,
                    records=record_dicts,
                    mapping_engine=mapping_engine,
                    db=db,
                    screenshot_dir=screenshot_dir,
                    module_name=sheet.sheet_name
                )
                
                # Update record statuses based on results
                fill_results = sheet_res.get("results", [])
                
                # Create a list to store report statuses for this sheet
                report_column = []
                
                for idx, r in enumerate(records):
                    if idx < len(fill_results):
                        is_success = fill_results[idx].get("success")
                        if is_success:
                            r.status = "success"
                            report_column.append("Created Successfully")
                        else:
                            r.status = "failed"
                            # log the error
                            err_msgs = fill_results[idx].get("errors", [])
                            err_str = "; ".join(err_msgs)
                            err_log = ExecutionLog(record_id=r.id, log_level="error", message=err_str)
                            db.add(err_log)
                            
                            # Determine user-friendly report text
                            err_lower = err_str.lower()
                            
                            # Check against expanded duplicate keywords
                            duplicate_keywords = ["already exist", "duplicate", "already taken", "already present", "already in use", "has been taken", "registered"]
                            
                            if any(kw in err_lower for kw in duplicate_keywords) or ("exists" in err_lower and "does not" not in err_lower):
                                report_column.append("Already Existed")
                            elif "required" in err_lower or "invalid or missing" in err_lower:
                                report_column.append(f"Missing/Invalid Fields: {err_str}")
                            else:
                                report_column.append(f"Failed: {err_str}")
                    else:
                        report_column.append("Skipped/No Result")
                
                # Attach the report column to the pandas dataframe for this sheet
                if sheet.sheet_name in excel_data:
                    df = excel_data[sheet.sheet_name]
                    # Ensure report_column matches dataframe length
                    if len(report_column) < len(df):
                        report_column.extend([""] * (len(df) - len(report_column)))
                    elif len(report_column) > len(df):
                        report_column = report_column[:len(df)]
                        
                    df["Execution Report"] = report_column
                    excel_data[sheet.sheet_name] = df
                
                job.status = "completed" if sheet_res["success"] else "completed_with_errors"
                db.commit()
                results["sheets_processed"] += 1
                successes = len([r for r in fill_results if r.get('success')])
                failures = len(fill_results) - successes
                results["logs"].append(f"Completed sheet '{sheet.sheet_name}': {successes} successes, {failures} failures")
                
            except Exception as e:
                print(f"Error orchestrating sheet '{sheet.sheet_name}': {e}")
                job.status = "failed"
                db.commit()
                results["logs"].append(f"Failed sheet '{sheet.sheet_name}': {str(e)}")
                
        # Save the updated Excel file
        if excel_data:
            try:
                base_dir = os.path.dirname(workbook.storage_path)
                original_filename = os.path.basename(workbook.storage_path)
                result_filename = f"result_{original_filename}"
                result_path = os.path.join(base_dir, result_filename)
                
                from openpyxl.styles import Font
                with pd.ExcelWriter(result_path, engine='openpyxl') as writer:
                    for sheet_name, df in excel_data.items():
                        df.to_excel(writer, sheet_name=sheet_name, index=False)
                        
                        # Apply color formatting to Execution Report column
                        try:
                            worksheet = writer.sheets[sheet_name]
                            report_col_idx = None
                            for col_idx, col_name in enumerate(df.columns, start=1):
                                if col_name == "Execution Report":
                                    report_col_idx = col_idx
                                    # Make column a bit wider for readability
                                    col_letter = worksheet.cell(row=1, column=col_idx).column_letter
                                    worksheet.column_dimensions[col_letter].width = 35
                                    break
                                    
                            if report_col_idx:
                                for row_idx in range(2, len(df) + 2):
                                    cell = worksheet.cell(row=row_idx, column=report_col_idx)
                                    val = str(cell.value or "").lower()
                                    if "created successfully" in val:
                                        cell.font = Font(color="008000", bold=True) # Green
                                    elif "already existed" in val:
                                        cell.font = Font(color="D97706", bold=True) # Amber/Orange
                                    elif "failed" in val or "missing" in val or "invalid" in val:
                                        cell.font = Font(color="DC2626", bold=True) # Red
                        except Exception as fmt_e:
                            print(f"Warning: Failed to format sheet {sheet_name}: {fmt_e}")
                
                print(f"Successfully generated execution report: {result_path}")
            except Exception as ex:
                print(f"Failed to save result Excel file: {ex}")
                
        return results
