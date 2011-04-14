Components.utils.import("resource://gipsy/util.jsm");

function elem(id) {
    return document.getElementById(id);
}

function _(str) {
    return elem('bundle').getString(str);
}

function fire_resize_event()
{
    var evobj = document.createEvent('HTMLEvents');
    evobj.initEvent('resize', false, false);
    window.dispatchEvent(evobj);
}
