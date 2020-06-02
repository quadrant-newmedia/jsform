(function() {
'use strict';

function handle_response(e) {
    var request = e.detail;
    // only handle text/javascript or application/javascript responses
    if (!/^(text|application)\/javascript/.test(request.getResponseHeader('content-type'))) return

    e.preventDefault();

    var form = e.target;

    // basically, we're "eval"-ing the response
    // This is more efficient and secure, though
    // Execute the response code as if it's the body of a function which can only access global scope, and the form element via a local "form" parameter.
    var f = new Function('form', request.responseText);

    // Note - returned function can return true to allow further form submissions
    // If the return code navigates the browser (which is asynchronous), you probably DO NOT want to do this.
    // You should return true, however, if you're just displaying some message and then letting the user submit again.
    var allow_further_submissions = Boolean(f(form));
    if (allow_further_submissions) {
        form.removeAttribute('block-submissions');
    }
}

addEventListener('jsformsuccess', handle_response);
addEventListener('jsformerror', handle_response);

})();
