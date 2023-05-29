# jsform

A new, event driven way to handle form submissions. 

Somewhat inspired by [this jquery form plugin](http://jquery.malsup.com/form/).

## Reason

Synchronous, full-page form submissions have the following issues:
- they end up creating needless history entries in the user's browser
- the user's scroll position and input focus/cursor position are lost
- file inputs are cleared (your server's response cannot possible restore them)

Creating a great UI requires submitting forms with AJAX. So far, no framework I've seen is both powerful enough and yet elegant/simple enough to understand.

## What it Does

Any form with `target="jsform"` will be submitted with an XMLHTTPRequest (even if you submit it manually via `form.submit()`), and several custom events will be dispatched on the form element.

We aim to recreate the request exactly as the browser would have created it for a normal form. The `action` and `method` are read from the form, and can be overridden per-submit button via `formaction` and `formmethod`. We ignore `enctype`, however; `application/x-www-form-urlencoded` is always used for GET requests, and `multipart/form-data` is used for all other methods.

## The Events

All events are dispatched on the form element, and they all bubble (so you can attach listeners directly to `window`). 

Also, you can specify inline event handlers via `on*` attributes, just like native DOM events. Like native inline handlers, the content of the attribute will be executed as a function with `event` as the sole parameter, and returning `false` will cause `event.preventDefault()` to be called.

    <small>Unlike native inline event handlers, ours are implemented by a single event listener, bound to the window on the capturing phase. This means they run earlier than native inline handlers would. If you don't know what this means, then it's very unlikely to have any impact on your code.</small>

### jsformsubmitted

This event is fired any time a form is submitted, right before the request is sent. `event.detail` will be an object with the following properties:

- **method**: the request method
- **action**: the request url (without any query string)
- **query**: the querystring (no leading '?', null for anything but GET requests)
- **body**: the request body (null for GET requests)
- **submitting_button**: the button the user clicked to submit the form, or `null`

This event has no default action.

Most use cases will not require listening to this event.

### jsformnetworkerror

Fired when the XMLHTTPRequest fails (an actual network error, _not_ an invalid HTTP status in the response). The default action is to `alert()` a basic message to the user (and to "unblock" the form if it's a GET request - see "Duplicate Submission Blocking" below). Call `event.preventDefault()` to prevent this action and provide your own means of feedback.

### jsformsuccess/jsformerror

If the XMLHTTPRequest succeeds, exactly one of these will be fired. `jsformsuccess` will be fired if the response status is 2XX, `jsformerror` will fired otherwise.

`event.detail` will be set to the XMLHTTPRequest object, allowing you to read the response, response headers, etc. 

We add one extra property to this XMLHTTPRequest object: `event.detail.jsform_data` will be an object with the same properties as `event.detail` in the `jsformsubmitted` event.

The default action is to `alert()` a basic success/error message to the user (and, sometimes, to "unblock" the form - see "Duplicate Submission Blocking" below). Call `event.preventDefault()` to cancel.

## Duplicate Submission Blocking

When a form is submitted, we add a `block-submissions` attribute to the form. Whenever this attribute is present, we will not allow further submissions. You _may_ want to use this attribute as a selector to style the form differently, or to block user input via javascript.

This attribute is set at the very beiggning of the submission process, before any of our events are fired. You may remove this attribute in any of your event listeners if you wish to allow further submissions.

Our default `jsformsuccess` and `jsformnetworkerror` actions will unblock the form _if and only if_ the submission method is GET. Our default `jsformerror` action will always unblock the form. In this case, we're assuming your server has not processed the data, and it's safe to retry submitting (this is especially helpful during development). If you want different handling of any of these events, be sure to handle them and call `event.preventDefault()`.

### Alternate Behaviour - Submission Replacing
If you add the "replace-overlapping-requests" attribute to your form, we will _not_ add the `block-submissions` attribute. Instead, each submission will cause the previous submission request (if still pending) to abort. This is useful bevhaviour for filter forms.

## Intended Usage

You _could_ manually add event listeners to each form you create, writing custom javascript to handle each response. 

Where jsform really shines, though, is when you create a framework with global event listeners, for handling common patterns. `jsform.js` includes one built-in event listener, and we also supply some opt-in listeners in separate scripts.

### `replace-query`

This built-in listener listens to `jsformsubmitted`. If the form has `replace-query` set as an attribute, then we `history.replaceState()` to update the querystring of the current url to match the data of the form.

This allows you to build "reloadable" pages, which restore the form state on reload or back/forward. 

Note - it's up to you to restore the form when the page is loaded with the query in the url.

Note - only works with GET submissions. 

### `jsform_execresponse.js`

This script adds an event listener which listens to `jsformsuccess` and `jsformerror` events. If the response has a content-type of `text/javascript`, then the content of the response is executed as a javascript function, with parameters 'form' and 'submitting_button'.

This is a really handy way for the server to return simple instructions to the page (ie. `history.back()`, `location.reload()`, or `location = "some_newly_created_object/"`).

Rather than hand-crafting such responses, we recommend creating a mini-framework in your backend of choice. The list of common responses you might generate is quite small.

### `jsform_elementmerge.js`

This is really cool, if I do say so myself.

If the submission response is of content-type `text/html`, then we mutate the current DOM as minimally as possible so that it matches the "new document" specified in that response. This allows you to add error/success messages, remove elements, etc., while leaving most elements untouched, so that your UI state (scroll position, focus, text selection, file input values) is not lost. 

Note that while we merge the entire document, including the `head`, dynamically updating the `src` of a `script` or the `href` of a `link` will have no effect (but adding a new `script` or `link` will cause that resource to be downloaded/used).

After merging is complete, we fire an `elementmergecomplete` event on the document. If you're using js-created widgets (ie. select2), you may need to re-initialize them when this event is fired.

We also provide a few "merge directives" for controlling the merge process, which you specify via custom html attributes. See the source code for details.

#### `elementmerge-nomerge`

Elements with this attribute will have neither child nodes nor attributes updated to match the corresponding new element. You can add this to elements whose contents are created/mutated via javascript at page load, so that those contents won't be erased/changed by the merge.

Note that an element with this attribute will still be *removed* from the DOM if there is no corrseponding element in the new document. Either this element will be untouched by the merge, or it will be removed completely.

#### `elementmerge-skip`

You should set this on elements which are added dynamically, which will have no corresponding element in the new document, but you still want to retain after the merge. 

This is important not only to ensure that this element does not get removed, but also so that all subsequent siblings of this element are merged with the correct corresponding elements in the new document.

#### `elementmerge-replace`

If an element in the current DOM has this attribute set, it will be replaced by the corresponding element from the new DOM (without merging any children). All client-side state will be wiped out. Useful when you want the server to update something which is normally front-end state (ie. the value of an input).

#### `elementmerge-whitelist`

If you set this attribute on one or more elements in the new document, then only those elements will be merged. You must set the id attribute on the element (in both old and new documents).

### TODO - jsform_elementmerge
- split into separate library
- document `elementmerge.reload()`, `elementmerge.merge_from()`, and the options you can pass to each
- document `elementmergecomplete` event

#### Benefit/Sample Use Case

If you're using a backend form processing framework (ie. Django) which regenerates the entire page/form on submit, you can probably make your user experience much better just by adding `jsform_elementmerge.js`.

Imagine you've got some type of "filtered list page", where a (GET) form is used to filter/paginate the results. In response to a form submission, your server recreates the entire page. Without jsform, the entire page reloads. The user's scroll position, focus, etc. are reset (and a new history entry is created). If the user updates the filter form many times, many history entries will be created.

Now imagine you add `target="jsform" replace-query` to the form, include `jsform_elementmerge.js` on the page, and make no other changes (the server's response to the form submission is exactly the same). 

Now the page updates "in place" when the user submits the form. Input focus, scroll position, etc. are not lost. If the user updates the filter form many times, only the last set of filters is "remembered". Reloading the page (or navigating away and then coming back) will still work (the page, with filled-in form, will be regenerated by your server).

#### Without jsform

`jsform_elementmerge.js` also exports a global `element_merge` object, with `reload()` and `merge_from(url)` methods. These can be called manually, without using `jsform`. Eventually, we should really split "elementmerge" into its own project.

### `jsform_focus_error_element.js`

Intended to be included after other scripts which listen to and process `jsformsuccess` events.

If the form element still exists when the `jsformsuccess` event is fired, tries to find the first "error element". If found, the "error element" is focused.

First looks for a non-empty element matching `[data-form-errors][tabindex]` inside the form (for form-level errors). If none found, finds the first form control belonging to the form with `[aria-invalid=true]`.

### Putting Them Together
`jsform_execresponse.js`, `jsform_elementmerge.js`, and `jsform_focus_error_element.js` go really well together. If you want to update the page in response to a form submission (ie. a successful "filter form", or a form with errors to report), just return a full html page. If the form was successful, and you want the user's browser to navigate/go back/reload/etc, return a javascript response.

## Requirements/Supported Form Features

We use `FormData()` to serialize data for POST requests, which requires IE 10+.

All of our features _should_ work in IE 10+ or any other current browser, but we haven't tested yet.

We get the browser to do as much as possible when it comes to serializing forms. All standard form features should be supported in any browser that supports said feature:
- file uploads
- overriding `target` or `method` on a submit button via `form*` attributes
- using `form` attribute on an input element outside of the form element (not supported in IE)

## X-Requested-With Header
All of our requests set the "X-Requested-With" HTTP header to "jsform". You _may_ want to check this header when writing generic code which can handle both jsform requests and normal page requests.

## Demo/Testing

This project is difficult to demo/test properly without a backend. [django_jsform](https://github.com/quadrant-newmedia/django_jsform) provides Django integration for jsform, and also serves as the official test/demo repository.

## Feedback/Issues

If you have any questions, suggestions or comments, feel free to [create a new issue](https://github.com/quadrant-newmedia/jsform/issues/new). 



