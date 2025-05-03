# Chrome Autoloader extension for Artillery.io

Adds a tab to Devtools, called `Artillery`. From here, you can record the network requests made while browsing your target site, and get a transcript of the relevant requests as a `flow` element, ready to be added to your scenario.

## Installation
Currently this is not available on Chromes Extension Store, mostly because I have not taken the time to find out how/what is required.
If you know how to do this, please go ahead if you feel its useful enough.


To try it out, go to
`chrome://extensions`

Enable `Developer Mode` in the top left corner, then choose `Load Unpacked` in the top right corner, and point to this directory.

After that, go to your target site, and press `F12`


## Using
On the `Artillery` page of Devtools, press `Start recording`, then perform your flow.
The extension will generate a `flow` structure you can paste into your scenario.
It will also record `think` times between blocks of requests.

## What is recorded
You can choose to record any of the following

- `XHR` requests (anything that returns a content type of `application/json`
- `Image` requests (anything that returns a content type of `image/*`
- `Other` anything not covered by the first two.

For each request the URL is recorded, as well as any post data.

You can choose to also capture request headers, by ticking the appropriate box. This will add any non-standard headers to the recorded output. 

By default it only records urls going to the same FQDN as the main window is started on. This can be disabled by unticking `Only this site`.

## Todos
The current setup is targeted towards developers of SPA's where each page transition can generate alot of traffic. Some work has been done to make sure it will behave more more traditional sites (mostly a concern with multipart/form-encoding), but no extensive testing has been done
