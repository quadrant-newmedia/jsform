/*
    After form submission, if the form has any invalid inputs, focus the first one.
    
    You should add this script AFTER any scripts that actually update the form from the server's response.

    Assumes you're setting [aria-invalid] on all invalid inputs.
    You can also focus form-level errors by including a non-empty element with [data-form-errors][tabindex=-1] inside the form.
*/
(function() {
'use strict';

addEventListener('jsformsuccess', function(event) {
    var ft = get_item_to_focus(event.target);
    ft && ft.focus();
});

function get_item_to_focus(form) {
    if (!form.ownerDocument) {
        // The form has been removed from the DOM
        return null
    }
    if (document.activeElement && document.activeElement.form == form && document.activeElement.getAttribute('aria-invalid') == 'true') {
        // An invalid input already has focus
        return null;
    }

    var form_error_container = form.querySelector('[data-form-errors]');
    // Notice - if you want form-level errors to be focused after submit, you should set tabindex attribute
    // (you can set tabindex="-1" to prevent keyboard focus but still allow programmatic focus)
    if (form_error_container && form_error_container.getAttribute('tabindex') && form_error_container.innerText.trim() != '') return form_error_container;
    
    for (var i = 0; i < form.elements.length; i++) {
        if (form.elements[i].getAttribute('aria-invalid') == 'true') return form.elements[i];
    }

    return null
}
});