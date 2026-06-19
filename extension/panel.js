



var operations = [];
var isRecording = false;
var urlPrefix = "";
var captureXhr = false;
var captureImage = false;
var captureOther = false;
var captureHeaders = false;
var captureOnlyThisSite = false;

var lastRequest = new Date();
var root = "";
// these are never captured
var filteredHeaders = ["Cache-Control", "Pragma", "Host", "User-Agent", "Cookie", "Referer","Origin", "Accept", "Referrer", "Accept-Language", "Accept-Encoding", "Content-Type", "Connection"];

// only these are captured
var capturedHttpMethods = ["get", "post", "put", "delete"];

function ChromeAutoloader() {
    operations = [];
    lastRequest = new Date();
};

ChromeAutoloader.isEmpty = function(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

ChromeAutoloader.record = function (event) {
    operations.push(event);

    document.getElementById("artillery").innerText = jsyaml.safeDump({
        flow: operations
    });

}

ChromeAutoloader.filterHeaders = function(headers) {
    var result = {};
    if (!headers) {
        return result
    }
    for(var h of headers) {
        var name = h.name;
        if (filteredHeaders.indexOf(name) < 0) {
            result[name] = h.value;
        }
    }
    return result;
}

ChromeAutoloader.handleRequest = function (har_entry) {
    
    var obj = undefined;

    var isXhr = false;
    var isImage = false;
    var isOther = false;
    // not recording, then exit
    if (!isRecording) {
        return;
    }

    // request going somewhere other than the primary site, then exit
    if (captureOnlyThisSite) {
        if (!har_entry.request.url.startsWith(root)) {
            return;
        }
    }

    var response_headers = har_entry.response.headers;
    var req_headers = {};


    // if we are capturing headers, go ahead and convert them to the artillery format
    if (captureHeaders) {
        req_headers = ChromeAutoloader.filterHeaders(har_entry.request.headers) || {};
    }

    // determine request type,b ased on response content type
    for (var i = 0; i < response_headers.length; ++i) {
        var header = response_headers[i];
        if (/^Content-Type/.test(header.name)) {
            if (header.value === 'application/json') {
                isXhr = true;
            }
        }
        if (/^Content-Type/.test(header.name)) {
            if (header.value.startsWith('image/')) {
                isImage = true;
            }
        }
        isOther = !isXhr && !isImage;
    }

    // quick exits for non-processed types
    if (isImage && !captureImage) {
        return;
    }
    if (isXhr && !captureXhr) {
        return;
    }
    if (isOther && !captureOther) {
        return;
    }

    // verify the http method
    var method = har_entry.request.method.toLowerCase();
    if (capturedHttpMethods.indexOf(method) < 0) {
        return;
    }


    // finally, convert the request to artillery format

    obj = {};
    obj[method] = {};
    obj[method].url = har_entry.request.url.replace(root,"");
    if (obj && !ChromeAutoloader.isEmpty(req_headers)) {
        obj[method].headers = req_headers;
    }
    if (isXhr && har_entry.request.postData && har_entry.request.postData.text) {
        obj[method].json = JSON.parse(har_entry.request.postData.text)
    }
    // todo, verify this somehow
    if (isOther && har_entry.request.postData && har_entry.request.postData.text) {
        obj[method].formData = JSON.parse(har_entry.request.postData.text)
    }


    // check if its been more than 1 second since last request. In that case add a think element
    var now = new Date();
    var elapsed = now.getTime() - lastRequest.getTime();
    if (elapsed > 1000 && operations.length > 0) {
        ChromeAutoloader.record({
            "think": parseInt(elapsed / 1000)
        });
    }
    lastRequest = now;

    // record it
    ChromeAutoloader.record(obj);


};


chrome.devtools.network.getHAR(function (result) {
    var entries = result.entries;
    if (!entries.length) {
        Console.warn("Autoloader suggests that you reload the page to track" +
            " XHR messages for all the requests");
    }

    chrome.devtools.network.onRequestFinished.addListener(
        ChromeAutoloader.handleRequest.bind(ChromeAutoloader));
});

window.addEventListener("load", function () {
    document.getElementById("record").addEventListener("click", ChromeAutoloader.toggleRecording);
    document.getElementById("export").addEventListener("click", ChromeAutoloader.copyToClipboard);
    document.getElementById("clear").addEventListener("click", ChromeAutoloader.clear);
});


ChromeAutoloader.clear = function() {
    operations = [];
    document.getElementById("artillery").innerText = jsyaml.safeDump({
        flow: operations
    });
}

ChromeAutoloader.copyToClipboard = function() {
    var el = document.createElement('textarea');
    var str = document.getElementById("artillery").innerText;
    el.value = str;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
}


ChromeAutoloader.toggleRecording = function() {
    isRecording = !isRecording;

    chrome.tabs.query({'active': true, 'lastFocusedWindow': true}, function (tabs) {
        root = tabs[0].url;
        root = root.substring(0, root.indexOf("/", 8));
        if (isRecording) {
            document.getElementById("record").textContent = "Stop recording (" + root +")";
        } else {
            document.getElementById("record").textContent = "Start recording";
        }
    });

    captureOnlyThisSite = document.getElementById("onlyThis").checked;
    captureXhr = document.getElementById("xhr").checked;
    captureImage = document.getElementById("image").checked;
    captureOther = document.getElementById("other").checked;
    captureHeaders = document.getElementById("headers").checked;


}