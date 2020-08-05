/*
    Note/TODO:
    This file was initially intended only for use with jsform.
    We now expose some useful global utility functions.
    It would probably be better to move this to an external library, and add it as a dependency.
*/

(function() {
'use strict';

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

function merge_documents(old_doc, new_doc) {
    /*
        First try finding and merging any [elementmerge-whitelist] elements
        This attribute should be specified in NEW document, and element must have an id (matching id of an element in old document)
    */
    if (merge_whitelist(old_doc, new_doc)) {
        return
    }

    /*
        If no whitelist, merge head and body
    */
    recursive_node_merge(
        old_doc.documentElement,
        old_doc.head,
        new_doc.head,
    );
    recursive_node_merge(
        old_doc.documentElement,
        old_doc.body,
        new_doc.body,
    );
}
function merge_whitelist(old_doc, new_doc) {
    var whitelist = new_doc.querySelectorAll('[elementmerge-whitelist]');
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
        recursive_node_merge(parent, old_element, whitelist[i]);
    }
    return true
}
function merge_from(url) {
    var r = new XMLHttpRequest();
    r.addEventListener('load', function(event) {
        if (r.status < 200 || r.status > 299) {
            return
        }
        merge_documents(document, r.response);
    });
    r.open('GET', url);
    r.responseType = 'document';
    r.send();
}

/*
    Expose some useful utility functions
*/
window.elementmerge = {
    merge_from: merge_from,
    reload: function() {
        merge_from(location.href);
    },
}


addEventListener('jsformsuccess', function(event) {
    var request = event.detail;

    // only handle text/html responses
    if (!/^text\/html/.test(request.getResponseHeader('content-type'))) return

    event.preventDefault();
    /*
        Note - XMLHTTPRequest has a built-in means of parsing response to a document.
        You have to set responseType to 'document', but you have to set this BEFORE you make the request.
        We can't do that - we want to let the server decide what type of response to return (which may depend on the form values).
    */
    merge_documents(document, new DOMParser().parseFromString(request.response, 'text/html'));
});

function recursive_node_merge(parent, old_node, new_node) {
    if (!old_node) {
        parent.appendChild(new_node.cloneNode(true));
        return
    }
    if (!new_node) {
        parent.removeChild(old_node);
        return
    }
    if (old_node.nodeName != new_node.nodeName || old_node.nodeType == Node.TEXT_NODE) {
        parent.insertBefore(new_node.cloneNode(true), old_node);
        parent.removeChild(old_node);
        return
    }

    if (!should_merge(old_node)) return

    // Now we have two nodes, both of same type

    // merge the children
    var i = 0, j = 0;
    // Note - old_node.childNodes.length may change (shrink) during this loop, so we really do have to recalculate each iteraction
    while (i < old_node.childNodes.length || j < new_node.childNodes.length) {
        if (should_skip(old_node.childNodes[i])) {
            i++;
            continue
        }
        recursive_node_merge(old_node, old_node.childNodes[i], new_node.childNodes[j]);
        i++;
        j++;
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
    var name, value;
    for (i = 0; i < new_names.length; i++) {
        name = new_names[i];
        value = new_node.getAttribute(name);
        new_name_map[name] = value;
        old_node.setAttribute(name, value);
    }
    for (i = 0; i < old_names.length; i++) {
        name = old_names[i];
        if (!new_name_map.hasOwnProperty(name)) {
            old_node.removeAttribute(name);
        }
    }
}
function should_merge(node) {
    if (!node.hasAttribute) return true // node is not an element

    // elements can set this attribute to prevent having their child nodes and attributes merged
    // They will be left alone, and the corresponding node in the new DOM will be ignored
    return !node.hasAttribute('elementmerge-nomerge')
}
function should_skip(old_node) {
    /*
        Any element that has this attribute will be skipped over.

        You should add this to elements that are added dynamically via javascript (meaning they will be present in old DOM, but not in new DOM).

        TODO - allow users to configure a selector for extra elements to skip (ie. a selector matching select2 elements).
    */
    return old_node && old_node.hasAttribute && old_node.hasAttribute('elementmerge-skip');
}

})();