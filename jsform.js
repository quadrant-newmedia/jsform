// Polyfill CustomEvent constructor, courtesy of MDN
// https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent#Polyfill
(function () {
  if ( typeof window.CustomEvent === "function" ) return false;
  function CustomEvent ( event, params ) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    var evt = document.createEvent( 'CustomEvent' );
    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );
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

function jsform_submit(form) {
    /*
        By default, we don't allow duplicate form submissions.

        If the end-user should be able to re-submit the same form, it's up to you to remove this attribute.

        You may remove the attribute in an event listener listening to any of our events (jsformsubmitted, jsformerror, or jsformsuccess).
    */
    if (form.hasAttribute('block-submissions')) return
    form.setAttribute('block-submissions', '')

    var submitting_button = get_submit_button(form);
    var method = ((submitting_button && submitting_button.getAttribute('formmethod')) || form.method).toLowerCase();
    var action = (submitting_button && submitting_button.getAttribute('formaction')) || form.action;

    // if GET, data needs to go in url query string
    // else, it goes in body
    function get_url() {
        if (method != 'get') return action
        // Now we need to serialize form
        // Ideally, we'd use FormData just like get_body, and pass to URLSearchParams to serialize, but that's not supported in IE, so we have to serialize ourselves
        return action.split('?')[0] + '?' + to_querystring(form, submitting_button);
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

    form.dispatchEvent(new CustomEvent('jsformsubmitted', {bubbles: true, detail: {
        method: method,
        action: action,
        query: method == 'get' ? to_querystring(form, submitting_button) : null,
        body: get_body(),
    }}));

    var r = new XMLHttpRequest();
    r.open(method, get_url());
    r.onerror = function(event) {
        var e = new CustomEvent('jsformnetworkerror', {bubbles: true, cancelable: true});
        form.dispatchEvent(e);
        if (!e.defaultPrevented) {
            alert('Failed to submit form: network error.');
        }
    }
    r.onload = function(event) {
        if (200 <= r.status && r.status < 299) {
            var e = new CustomEvent('jsformsuccess', {
                detail: r,
                bubbles: true,
                cancelable: true,
            });
            form.dispatchEvent(e);
            if (!e.defaultPrevented) {
                alert('Submission complete: '+r.status+' '+r.statusText);
            }
        }
        else {
            var e = new CustomEvent('jsformerror', {
                detail: r,
                bubbles: true,
                cancelable: true,
            });
            form.dispatchEvent(e);
            if (!e.defaultPrevented) {
                alert('Submission error: '+r.status+' '+r.statusText);
            }
        }
    }
    r.send(get_body());
}

addEventListener('submit', function(e) {
    if (e.defaultPrevented) return
    if (e.target.target == 'jsform') {
        e.preventDefault();
        jsform_submit(e.target);
    }
});

var _submit = HTMLFormElement.prototype.submit;
HTMLFormElement.prototype.submit = function() {
    if (this.target == 'jsform') jsform_submit(this)
    else _submit.call(this)
}

addEventListener('jsformsubmitted', function(e) {
    if (!e.detail.method == 'get') return
    if (e.target.hasAttribute('replace-query')) {
        history.replaceState(history.state, '', '?'+e.detail.query);
    }
    else if (e.target.hasAttribute('push-query')) {
        history.pushState(history.state, '', '?'+e.detail.query);
    }
});

})();