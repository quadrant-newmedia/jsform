/*
    Note/TODO:
    This file was initially intended only for use with jsform.
    We now expose some useful global utility functions.
    It would probably be better to move this to an external library, and add it as a dependency.

    TODO: support "relocating" elements with id
    - similar to "key" concept in react, but it's global
*/

(function() {
'use strict';

if (!Element.prototype.matches) {
  Element.prototype.matches = Element.prototype.msMatchesSelector ||
                              Element.prototype.webkitMatchesSelector;
}

// getAttributeNames polyfill, courtesy of MDN
if (Element.prototype.getAttributeNames == undefined) {
  Element.prototype.getAttributeNames = function () {
    var attributes = this.attributes;
    var length = attributes.length;
    var result = new Array(length);
    for (var i = 0; i < length; i++) {
      result[i] = attributes[i].name;
    }
    return result;
  };
}

function merge_documents(old_doc, new_doc, options) {
    var options = with_defaults(options);

    /*
        First try finding and merging any [elementmerge-whitelist] elements
        This attribute should be specified in NEW document, and element must have an id (matching id of an element in old document)
    */
    if (merge_whitelist(old_doc, new_doc, options)) {
        return
    }

    /*
        If no whitelist, merge head and body
    */
    recursive_node_merge(
        old_doc.documentElement,
        old_doc.head,
        new_doc.head,
        options
    );
    recursive_node_merge(
        old_doc.documentElement,
        old_doc.body,
        new_doc.body,
        options
    );

    old_doc.dispatchEvent(createEvent('elementmergecomplete', false, false, null));
}
function merge_whitelist(old_doc, new_doc, options) {
    var whitelist = new_doc.querySelectorAll(options.whitelist);
    if (!whitelist.length) {
        return false
    }
    for (var i = whitelist.length - 1; i >= 0; i--) {
        try {
            var old_element = old_doc.getElementById(whitelist[i].id);
            var parent = old_element.parentElement;
        }
        catch(e) {
            console.error('Unable to find element in old document corresponding to: ',  whitelist[i], '. It either has no id, or no corresponding element in the old document.');
            continue
        }
        recursive_node_merge(parent, old_element, whitelist[i], options);
    }
    return true
}
function merge_from(url, options) {
    var r = new XMLHttpRequest();
    r.addEventListener('load', function(event) {
        if (r.status < 200 || r.status > 299) {
            return
        }
        merge_documents(document, r.response, options);
    });
    r.open('GET', url);
    r.responseType = 'document';
    r.send();
}

/*
    Expose some useful utility functions
*/
window.elementmerge = {
    default_options: {
        whitelist: '',
        skip: '',
        nomerge: '',
    },
    merge_from: merge_from,
    reload: function(options) {
        merge_from(location.href, options);
    },
}


addEventListener('jsformsuccess', function(event) {
    var request = event.detail;

    // only handle text/html responses
    if (!/^text\/html/.test(request.getResponseHeader('content-type'))) return

    event.preventDefault();

    // TODO - allow user to specify these selectors as custom attributes on form?
    var options = {};
    /*
        Note - XMLHTTPRequest has a built-in means of parsing response to a document.
        You have to set responseType to 'document', but you have to set this BEFORE you make the request.
        We can't do that - we want to let the server decide what type of response to return (which may depend on the form values).
    */
    merge_documents(document, new DOMParser().parseFromString(request.response, 'text/html'), options);
});

function recursive_node_merge(parent, old_node, new_node, options) {
    if (!old_node) {
        parent.appendChild(new_node.cloneNode(true));
        return
    }
    if (!new_node) {
        parent.removeChild(old_node);
        return
    }
    if (old_node.nodeName != new_node.nodeName || old_node.nodeType == Node.TEXT_NODE || should_replace(old_node, options)) {
        parent.insertBefore(new_node.cloneNode(true), old_node);
        parent.removeChild(old_node);
        return
    }
    if (!should_merge(old_node, options)) return

    // Now we have two nodes, both of same type

    // merge the children
    var old_child = old_node.childNodes[0], new_child = new_node.childNodes[0];
    var next_old;
    while (old_child || new_child) {
        if (should_skip(old_child, options)) {
            old_child = old_child.nextSibling;
            continue;
        }

        // old_child might get deleted, so store reference to next
        next_old = old_child && old_child.nextSibling;
        recursive_node_merge(old_node, old_child, new_child, options);
        old_child = next_old;
        new_child = new_child && new_child.nextSibling;
    }



    // merge the attributes
    if (!old_node.hasAttribute) return // This is not an element (ie. a text node)

    /* 
        Note - we have to be careful about how we merge
        We cannot blindly erase all and then reset, or the element may lose state.
        Ie. input[type=file] will lose its value as soon as you remove the type attribute.
    */
    var new_names = new_node.getAttributeNames();
    var new_name_map = {};
    var old_names = old_node.getAttributeNames();
    var i, name, value;
    for (i = 0; i < new_names.length; i++) {
        name = new_names[i];
        value = new_node.getAttribute(name);
        new_name_map[name] = value;

        /*
            This check seems unnecessary, but it's not.
            Sometimes setAttribute has side effects, even if the value doesn't change.
            Ie. when "re-setting" the href attrubute of <link>, stylesheet seems to be removed then reapplied (which causes style to change/flash).
            I haven't been able to reproduce that behaviour outside of this script, but it was happening consistently during elementmerge.reload() before I had this check.
        */
        if (old_node.getAttribute(name) != value) {
            old_node.setAttribute(name, value);
        }
    }
    for (i = 0; i < old_names.length; i++) {
        name = old_names[i];
        if (!new_name_map.hasOwnProperty(name)) {
            old_node.removeAttribute(name);
        }
    }
}
function should_merge(node, options) {
    if (!node.hasAttribute) return true // node is not an element

    // elements can set this attribute to prevent having their child nodes and attributes merged
    // They will be left alone, and the corresponding node in the new DOM will be ignored
    return !node.matches(options.nomerge);
}
function should_skip(old_node, options
    ) {
    /*
        Any element that matches this selector will be skipped over.

        You should add this to elements that are added dynamically via javascript (meaning they will be present in old DOM, but not in new DOM).
    */
    return old_node && old_node.matches && old_node.matches(options.skip);
}
function should_replace(old_node, options) {
    return old_node && old_node.matches && old_node.matches(options.replace);
}

function get_option_selector(options, option_name) {
    var fixed_value = '[elementmerge-'+option_name+']';
    var option_value = options[option_name] || elementmerge.default_options[option_name];
    if (option_value) {
        return [fixed_value, option_value].join(', ');
    }
    return fixed_value;
}
function with_defaults(options) {
    options = options || {};
    return {
        whitelist: get_option_selector(options, 'whitelist'),
        skip: get_option_selector(options, 'skip'),
        nomerge: get_option_selector(options, 'nomerge'),
        replace: get_option_selector(options, 'replace'),
    }
}

function createEvent(name, bubbles, cancelable, detail) {
    if ( typeof window.CustomEvent === "function" ) return new CustomEvent(name, {bubbles: bubbles, cancelable: cancelable, detail: detail});
    var event = document.createEvent('CustomEvent');
    event.initCustomEvent(event, bubbles, cancelable, detail);
    return event;
}

})();