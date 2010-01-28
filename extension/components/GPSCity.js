/* Module for finding city near a point */

const nsISupports = Components.interfaces.nsISupports;

const CLASS_ID = Components.ID("bfb101f6-3ed2-42a4-9616-c1f8e983ee03");
const CLASS_NAME = "City database";
const CONTRACT_ID = "@pgweb.cz/Gipsy/GPSCities;1";

var citydb;

// GPSPoint initialization
function GPSPoint(lat, lon, alt)
{
    var point = Components.classes["@pgweb.cz/Gipsy/GPSPoint;1"].createInstance(Components.interfaces.IGPSPoint);
    point.initPoint(lat, lon, alt, 0);
    return point;
}


function chromeToPath(aPath) 
{
    var rv;

    var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
    var uri = ios.newURI(aPath, "UTF-8", null);
    
    var cr = Components.classes["@mozilla.org/chrome/chrome-registry;1"].getService(Components.interfaces.nsIChromeRegistry);
    
    rv = cr.convertChromeURL(uri);
    
    if (typeof(rv) != "string")
	rv = cr.convertChromeURL(uri).spec;

    // preserve the zip entry path "!/browser/content/browser.xul"
    // because urlToPath will flip the "/" on Windows to "\"
    var jarPath = "";
    if (/jar:/.test(rv)) {
	rv = rv.replace(/jar:/, "");
	var split = rv.split("!");
	rv = split[0];
	jarPath = "!" + split[1];
    }
    
    if (/resource:/.test(rv))
	rv = rv.replace(/.*resource:/, this.mDirUtils.getCurProcDir());
    
    if (/^file:/.test(rv))
	rv = urlToPath(rv);
    else
	rv = urlToPath("file://"+rv);
    
    rv += jarPath;
    
    return rv;
}

function urlToPath(aPath)
{
    var rv;
    var ph = Components.classes["@mozilla.org/network/protocol;1?name=file"].getService(Components.interfaces.nsIFileProtocolHandler);
    
    rv = ph.getFileFromURLSpec(aPath).path;
    
    return rv;
}


function GPSCities() {
    this.wrappedJSObject = this;

    try {
	// Open database
	var vpath = chromeToPath('chrome://gipsy/content/cities.db');
	
	var dbfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
	dbfile.initWithPath(vpath);
	
	var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
	
	this.db = storageService.openDatabase(dbfile);
    } catch (e) {
	dump("error opening city db");
	this.db = null;
	// do nothing
    }
}

// This is the implementation of your component.
GPSCities.prototype = {
    query_point: function(basepoint) {
	if (this.db == null)
	    return null;

	var lat = Math.round((basepoint.lat+0.25) * 2) / 2.0 - 0.25;
	var lon = Math.round((basepoint.lon+0.25) * 2) / 2.0 - 0.25;

	var sec1 = Math.round((lat-0.25) * 2 * 1000 + 2 * (lon - 0.25));
	var sec2 = Math.round((lat-0.25) * 2 * 1000 + 2 * (lon + 0.25));
	var sec3 = Math.round((lat+0.25) * 2 * 1000 + 2 * (lon - 0.25));
	var sec4 = Math.round((lat+0.25) * 2 * 1000 + 2 * (lon + 0.25));

	try {
	    var statement = this.db.createStatement('SELECT country, city, lat, lon FROM cities WHERE sector=?1 OR sector=?2 OR sector=?3 OR sector=?4');
	    statement.bindInt32Parameter(0, sec1);
	    statement.bindInt32Parameter(1, sec2);
	    statement.bindInt32Parameter(2, sec3);
	    statement.bindInt32Parameter(3, sec4);
	    
	    var result = [];
	    while (statement.executeStep()) {
		var lat = statement.getDouble(2);
		var lon = statement.getDouble(3);
		var distance = basepoint.distance_raw(lat,lon);
		result.push({
		    country : statement.getString(0),
			city : statement.getString(1),
			distance : distance,
			lat : lat,
			lon : lon
			});
	    }
	} catch (e) {
	    return null;
	}
	if (result.length == 0)
	    return null;
	// Find nearest point
	var nearest = result[0];
	for (var i=1; i < result.length; i++) {
	    if (result[i].distance < nearest.distance)
		nearest = result[i];
	}
	nearest.point = GPSPoint(nearest.lat, nearest.lon);
	return nearest;
    },
    
  // for nsISupports
    QueryInterface: function(aIID)
	{
	    // add any other interfaces you support here
	    if (!aIID.equals(nsISupports))
		throw Components.results.NS_ERROR_NO_INTERFACE;
	    return this;
	}
}

//=================================================
// Note: You probably don't want to edit anything
// below this unless you know what you're doing.
//
// Factory
var GPSCitiesFactory = {
  singleton: null,
  createInstance: function (aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    if (this.singleton == null)
      this.singleton = new GPSCities();
    return this.singleton.QueryInterface(aIID);
  }
};

// Module
var GPSCitiesModule = {
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType)
  {
    aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
  },

  unregisterSelf: function(aCompMgr, aLocation, aType)
  {
    aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
  },
  
  getClassObject: function(aCompMgr, aCID, aIID)
  {
    if (!aIID.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    if (aCID.equals(CLASS_ID))
      return GPSCitiesFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

//module initialization
function NSGetModule(aCompMgr, aFileSpec) { return GPSCitiesModule; }
