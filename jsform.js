// Polyfill CustomEvent constructor, courtesy of MDN (MODIFIED - added preventDefault support)
(function () {
  if ( typeof window.CustomEvent === "function" ) return false;
  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
    evt.preventDefault = function() {
        Object.defineProperty(this, "defaultPrevented", {get: function () {return true;}});
    }
    return evt;
   }
  window.CustomEvent = CustomEvent;
})();


(function() {
'use strict';

// track the "submitting button"
var clicked_button = null;
addEventListener('click', function(e) {
    clicked_button = get_nearest_submit_button(e.target);
});
function get_nearest_submit_button(element) {
    if (element.type == 'submit') return element;
    if (element.parentElement) return get_nearest_submit_button(element.parentElement);
    return null
}
addEventListener('keydown', function() {
    clicked_button = null;
});
function get_submit_button(form) {
    var button = clicked_button;
    if (!button) return null
    if (button.form != form) return null
    return button
}

/*
    Note - there is no way to use FormData to get a querystring in IE
*/
function to_querystring(form, submitting_button) {
    var items = [];

    // TODO - Document limitation? Find work around?
    if (typeof form.elements.length === 'undefined') {
        throw new Error('Cannot serialize the form. It looks like this form has a control named "elements". That masks the "elements" property on the form, which need in order to serialize the form.');
    }

    for (var i = form.elements.length - 1; i >= 0; i--) {
        var e = form.elements[i];
        if ((e.type == 'radio' || e.type == 'checkbox') && !e.checked) continue
        if (e.disabled) continue
        if (e.type == 'file') throw new Error('Forms with file inputs cannot be serialized.')
        // button[type=button] elements should not be submitted
        if (e.type == 'button') continue
        // submit buttons should only be submitted if clicked
        if (e.type == 'submit' && e != submitting_button) continue
        if (!e.name) continue
        if (e.nodeName == 'SELECT' && e.multiple) {
            // select inputs with [multiple] need special handling
            pushSelectedOptions(e, items);
        } else {
            items.push(encodeURIComponent(e.name)+'='+encodeURIComponent(e.value));
        }
    }
    return items.join('&');
}
function pushSelectedOptions(select, items) {
    for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].selected) {
            items.push(encodeURIComponent(select.name)+'='+encodeURIComponent(select.options[i].value));
        }
    }
}

function unblock(form) {
    form.removeAttribute('block-submissions');
}

function jsform_submit(form) {
    /*
        By default, we don't allow duplicate form submissions.

        If the end-user should be able to re-submit the same form, it's up to you to remove this attribute.

        You may remove the attribute in an event listener listening to any of our events (jsformsubmitted, jsformerror, or jsformsuccess).
    */
    if (form.hasAttribute('block-submissions')) return
    form.setAttribute('block-submissions', '')

    /*
        Form elements (inputs) can mask standard form properties,
        so we cannot safely access form.action, form.method, etc.
        
        Also, the js properties are more convenient that html attributes, since they do things like resolve the action url for us.

        Since this clone has no input children, we can safely access properties on it.
    */
    var form_clone = form.cloneNode(false);

    var submitting_button = get_submit_button(form);
    var method = ((submitting_button && submitting_button.getAttribute('formmethod')) || form_clone.method).toLowerCase();
    // NOTE - in IE, form_clone.action is not handled properly (when attribute is empty), so we have to set explicit fallback of current url
    var action = (submitting_button && submitting_button.getAttribute('formaction')) || form_clone.action || location.href;

    // if GET, data needs to go in url query string
    // else, it goes in body
    function get_url() {
        if (method != 'get') return action
        // Now we need to serialize form
        // Ideally, we'd use FormData just like get_body, and pass to URLSearchParams to serialize, but that's not supported in IE, so we have to serialize ourselves
        // Note - be sure to trim off any existing querystring or hash from the action
        return action.split(/[#?]/)[0] + '?' + to_querystring(form, submitting_button);
    }
    function get_body() {
        if (method == 'get') return null
        var d = new FormData(form);
        /*
            If user clicked a submit button to submit the form, attach name/value
            Note - unlike some browsers, if the user submits the form by pressing enter from an input field, we do NOT try to determine the "default" submit button. 
            If you want to treat a button as default, you should handle that on the backend.
        */
        if (submitting_button && submitting_button.name) {
            d.append(submitting_button.name, submitting_button.value);
        }
        return d;
    }

    var jsform_data = {
        method: method,
        action: action,
        query: method == 'get' ? to_querystring(form, submitting_button) : null,
        body: get_body(),
        submitting_button: submitting_button,
    }
    form_clone.dispatchEvent.call(form, (new CustomEvent('jsformsubmitted', {bubbles: true, detail: jsform_data})));

    var r = new XMLHttpRequest();
    r.open(method, get_url());
    r.onerror = function(event) {
        var e = new CustomEvent('jsformnetworkerror', {bubbles: true, cancelable: true});
        form_clone.dispatchEvent.call(form, (e));
        if (!e.defaultPrevented) {
            alert('Failed to submit form: network error.');
            // Unblock the form, IFF it's a get request
            // We assume POST may alter data on server, and user must explicitly unblock the form if they want to allow further submissions
            if (method == 'get') unblock(form);
        }
    }
    r.onload = function(event) {
        /*
            Initially, we thought r contained everything needed for event listeners.
            However, there is no way to get request method from it.
            Rather than change event.detail in a backward in-compatible way, we attach extra data to r.
        */
        r.jsform_data = jsform_data;
        if (200 <= r.status && r.status < 299) {
            var e = new CustomEvent('jsformsuccess', {
                detail: r,
                bubbles: true,
                cancelable: true,
            });
            form_clone.dispatchEvent.call(form, (e));
            if (!e.defaultPrevented) {
                alert('Submission complete: '+r.status+' '+r.statusText);
                // Unblock the form, IFF it's a get request
                // We assume POST may alter data on server, and user must explicitly unblock the form if they want to allow further submissions
                if (method == 'get') unblock(form);
            }
        }
        else {
            var e = new CustomEvent('jsformerror', {
                detail: r,
                bubbles: true,
                cancelable: true,
            });
            form_clone.dispatchEvent.call(form, (e));
            if (!e.defaultPrevented) {
                alert('Submission error: '+r.status+' '+r.statusText);
                unblock(form);
            }
        }
    }
    r.setRequestHeader('X-Requested-With', 'jsform');
    r.send(get_body());
}

function should_use_jsform(form) {
    var submit_button = get_submit_button(form);
    if (submit_button && submit_button.hasAttribute('formtarget')) {
        return submit_button.getAttribute('formtarget') == 'jsform'
    }
    return form.getAttribute('target') == 'jsform'
}

/*
    Handle all user submissions of [target=jsform]
*/
addEventListener('submit', function(e) {
    if (e.defaultPrevented) return
    if (should_use_jsform(e.target)) {
        e.preventDefault();
        jsform_submit(e.target);
    }
});

/*
    Patch .submit() so that programmatic submissions still use jsform
*/
var _submit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function() {
    // clear the "candidate submitting button"
    // programmatic submissions should never submit any submit button
    clicked_button = null;

    if (should_use_jsform(this)) {
        jsform_submit(this);
    }
    else {
        _submit.call(this);
    }
}

/*
    Allow users to specify inline event handlers via on* attributes on the form
*/
function createInlineHandler(event_name) {
    addEventListener(event_name, function(e) {
        var handler = e.target.getAttribute('on'+event_name);
        if (!handler) return
        // convert the handler (string) to an actual function
        handler = new Function('event', handler);
        // call the handler, preventDefault() if it returns false, just like with other inline handlers
        if (handler.call(e.target, e) === false) {
            e.preventDefault();
        }
    // Notice - we listen on capturing phase. 
    // This means this works even for events that don't bubble, and the in-line handler will generally run before any other event listeners
    }, true);
}
createInlineHandler('jsformsubmitted');
createInlineHandler('jsformnetworkerror');
createInlineHandler('jsformerror');
createInlineHandler('jsformsuccess');

/*
    [replace-query] listener
*/
addEventListener('jsformsubmitted', function(e) {
    if (e.target.hasAttribute('replace-query')) {
        if (e.detail.method != 'get') {
            console.warn('replace-query only works with method="GET"');
        }
        else {
            history.replaceState(history.state, '', '?'+e.detail.query);
        }
    }
});

})();