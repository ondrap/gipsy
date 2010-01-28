var needrestart = false;
var ishomedir = false;

var gstore  = Components.classes["@pgweb.cz/Gipsy/GPSstore;1"].getService().wrappedJSObject;


function onload() {
    var datadir = get_string_pref('datadir');
    
    if (datadir) {
	elem('directory').value = datadir;
	ishomedir = false;
    } else {
	elem('directory').value = gstore.getDefaultDir().path;
	ishomedir = true;
    }
}

function set_to_home() {
    ishomedir = true;
    needrestart = true;
    elem('directory').value = gstore.getDefaultDir().path;
}

function save_autodownload() {
    if (needrestart) {
	alert(_('pref_restart'));
	needrestart= false;
    }
    return elem('autodownload_ck').value;
}

function save_datadir() {
    if (needrestart) {
	alert(_('pref_restart'));
	needrestart= false;
    }
    if (ishomedir)
	return '';
    var path = elem('directory').value;
    return path;
}

function ask_data_dialog() {
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, "Data directory", nsIFilePicker.modeGetFolder);
    var res = fp.show();
    if (res == fp.returnOK) {
	ishomedir = false;
	needrestart = true;
	elem('directory').value = fp.file.path;
    }
}
