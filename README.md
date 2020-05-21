# jsform

A new, event driven way to handle form submissions. 

Somewhat inspired by [this jquery form plugin](http://jquery.malsup.com/form/).

## Project Status

This project is almost completely untested. We plan to develop/test it as we find uses for it. That said, if you have any questions, suggestions or comments, feel free to [create a new issue](https://github.com/quadrant-newmedia/jsform/issues/new). 

## Reason

Synchronous, full-page form submissions have the following issues:
- they end up creating needless history entries in the user's browser
- the user's scroll position and input focus/cursor position are lost
- file inputs are cleared (your server's response cannot possible restore them)

Creating a great UI requires submitting forms with AJAX. So far, no framework I've seen is both powerful enough and yet elegant/simple enough to understand.

## What it Does

Any form with `target="jsform"` will be submitted with an XMLHTTPRequest (even if you submit it manually via `form.submit()`). We aim to recreate the request exactly as the browser would have created it otherwise. 

The `action` and `method` are read from the form, and can be overridden per-submit button via `formaction` and `formmethod`. We ignore `enctype`, however; `application/x-www-form-urlencoded` is always used for GET requests, and `multipart/form-data` is used for all other methods.

The only opportunity you have to handle the submission is by listening to the events we dispatch. All events are dispatched on the form element, and they all bubble (so you can attach listeners directly to `window`).

### jsformsubmitted

This event is fired any time a form is submitted, right before the request is sent. `event.detail` will be an object with the following properties:

- **method**: the request method
- **action**: the request url (without any query string)
- **query**: the querystring (no leading '?', null for anything but GET requests)
- **body**: the request body (null for GET requests)

This event has no default action.

Most use cases will not require listening to this event.

### jsformnetworkerror

Fired when the XMLHTTPRequest fails (an actual network error, _not_ an invalid HTTP status in the response). The default action is to `alert()` a basic message to the user. `preventDefault()` to prevent the action and provide your own means of feedback.

### jsformsuccess/jsformerror

If the XMLHTTPRequest succeeds, exactly one of these will be fired. `jsformsuccess` will be fired if the response status is 2XX, `jsformerror` will fired otherwise.

`event.detail` will be set to the XMLHTTPRequest object, allowing you to read the response, response headers, etc.

The default action is to `alert()` a basic success/error message to the user. `preventDefault()` to cancel.

## Duplicate Submission Blocking

When a form is submitted, we add a `block-submissions` attribute to the form. Whenever this attribute is present, we will not allow further submissions. You _may_ want to use this attribute as a selector to style the form differently, or to block user input via javascript.

This attribute is set at the very beiggning of the submission process, before any of our events are fired. You may remove this attribute in any of your event listeners if you wish to allow further submissions.

## Intended Usage

You _could_ manually add event listeners to each form you create. Where jsform really shines, though, is when you add global event listeners that take appropriate action, based on the response details (and possibly form attributes/data).

### `replace-query` and `push-query`

We supply a built-in event listener which listens to `jsformsubmitted`. If the form has `replace-query` set as an attribute, then we `history.replaceState()` to update the querystring of the current url to match the data of the form. Likewise, if the form has `push-query`, then we `history.pushState()`.

This allows you to build "reloadable" pages. The (ajax) form request returns only the information needed to update/mutate the page. If the user reloads the page (or returns to it via browser history), your server should know how to generate the entire page.

### `jsform_execresponse.js`

This script adds an event listener which listens to `jsformsuccess` events. If the response has a content-type of `text/javascript`, then the content of the response is executed as javascript code (it's slightly more complicated than that - read the source to see the details).

This is a really handy way for the server to return simple instructions to the page (ie. `history.back()`, `location.reload()`, or `location = "some_newly_created_object/"`).

Rather than hand-crafting such responses, we recommend creating a mini-framework in your backend of choice. The list of common responses you might generate is quite small.

### `jsform_elementmerge.js`

This is really cool, if I do say so myself.

If the submission response is of content-type `text/html`, then we "merge" that document with the current one. This allows you to add error/success messages, remove elements, etc. However, elements are actually kept in the DOM, so your UI state (scroll position, focus, text selection, file input values) is not lost.  

Imagine you're using a typical backend framework like Django, and you've got some type of "filtered list page", where a (GET) form is used to filter/paginate the results. In response to a form submission, your server recreates the entire page. Without jsform, the entire page reloads. The user's scroll position, focus, etc. are reset (and a new history entry is created). If the user updates the filter form many times, many history entries will be created.

Now imagine you add `target="jsform" replace-query` to the form, include `jsform_elementmerge.js` on the page, and do nothing else (the server's response to the form submission is exactly the same). 

Now the page updates "in place" when the user submits the form. Input focus, scroll position, etc. are not lost. If the user updates the filter form many times, only the last set of filters is "remembered". Reloading the page (or navigating away and then coming back) will still work (the page, with filled-in form, will be regenerated by your server).

### Putting Them Together
`jsform_execresponse.js` and `jsform_elementmerge.js` go really well together. If you want to update the page in response to a form submission (ie. a successful "filter form", or a form with errors to report), just return a full html page. If the form was successful, and you want the user's browser to navigate/go back/reload/etc, return a javascript response.

## Requirements/Supported Form Features

We use `FormData()` to serialize data for POST requests, which requires IE 10+.

All of our features _should_ work in IE 10+ or any other current browser, but we haven't tested yet.

We get the browser to do as much as possible when it comes to serializing forms. All standard form features should be supported in any browser that supports said feature:
- file uploads
- overriding `target` or `method` on a submit button via `form*` attributes
- using `form` attribute on an input element outside of the form element (not supported in IE)

## TODO
- create a reusbale Django app, including static files and a simple set of "javascript responses"
- create tests 


