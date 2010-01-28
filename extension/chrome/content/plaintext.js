var gstore  = Components.classes["@pgweb.cz/Gipsy/GPSstore;1"].getService().wrappedJSObject;

function OnLoad() {
    var file = gstore.getIGCFile(window.arguments[0]);

    var istream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
    istream.init(file, 0x01, 0444, 0);
    istream.QueryInterface(Components.interfaces.nsILineInputStream);

    var text = '';
    var hasmore;
    var line = {};
    do {
	hasmore = istream.readLine(line);
	text += line.value + '\n';
    } while (hasmore);
    istream.close();

    elem('igc_text').value = text;
    document.title = window.arguments[0];

}
window.onload = OnLoad;
