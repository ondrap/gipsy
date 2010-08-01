/* Module for storing and retrieving IGC files from local repository */


const nsISupports = Components.interfaces.nsISupports;

// You can change these if you like
const CLASS_ID = Components.ID("1391ed51-deb3-4be6-a157-4d774deaa990");
const CLASS_NAME = "Store of IGC flights";
const CONTRACT_ID = "@pgweb.cz/Gipsy/GPSstore;1";

const GipsyDirectory = 'gipsy';

const DBVERSION = 5;

var loader;
var citydb;

// GPSPoint initialization
function GPSPoint(lat, lon, alt)
{
    var point = Components.classes["@pgweb.cz/Gipsy/GPSPoint;1"].createInstance(Components.interfaces.IGPSPoint);
    point.initPoint(lat, lon, alt, 0);
    return point;
}

// Constructor
function GPSStore() 
{
    // Load sprintf
    loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
    loader.loadSubScript('chrome://gipsy/content/util.js');

    // City databas
    citydb = Components.classes["@pgweb.cz/Gipsy/GPSCities;1"].getService();
    if (citydb == null) {
	throw "SQL DB not accessible"
    }
    citydb = citydb.wrappedJSObject;

    // Make it easy
    this.wrappedJSObject = this;

    var xulRuntime = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime);
    this.OS = xulRuntime.OS;
    

    // Set up the directory for saving files
    var datadir = get_string_pref('datadir');
    var appdir = null;
    if (datadir) {
	var appdir = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
	appdir.initWithPath(datadir);
	if (!appdir.exists())
	    appdir.create(appdir.DIRECTORY_TYPE, 0755);
    }
    // Fall back here if it was not created
    if (!appdir) {
	var appdir = this.getDefaultDir();
	if (!appdir.exists())
	    appdir.create(appdir.DIRECTORY_TYPE, 0755);
    }
    this.appdir = appdir;

    // Set up the SQL source
    this.sqfile = appdir.clone().QueryInterface(Components.interfaces.nsILocalFile);
    this.sqfile.appendRelativePath('flights.db');

    var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);

    var initdb = ! this.sqfile.exists();
    this.db = storageService.openDatabase(this.sqfile);
    if (initdb)
	this.createTables();
}

GPSStore.prototype = {
    // 500m is the radius where the site is positively identified
    SITE_DISTANCE : 500,
    SYNCHRO_NONE : 0,
    SYNCHRO_ENABLED : 1,
    SYNCHRO_DONE : 2,

    sqfile : null, // Database filename
	
    // for nsISupports
    QueryInterface : function(aIID)
    {
	// add any other interfaces you support here
	if (!aIID.equals(nsISupports)) {
	    throw Components.results.NS_ERROR_NO_INTERFACE;
	}
	return this;
    } ,

    updateDB : function() {
	if (this.getDBVersion() == 2) {
	    this.db.executeSimpleSQL("CREATE TABLE config (key text, value text)");
	    this.db.executeSimpleSQL("UPDATE version SET version=3");
	    
	}
	if (this.getDBVersion() == 3) {
	    this.db.executeSimpleSQL("ALTER TABLE history ADD COLUMN xcontest_claim integer");
	    this.db.executeSimpleSQL("UPDATE history SET xcontest_claim=1");
	    this.db.executeSimpleSQL("UPDATE version SET version=4");
	}
	if (this.getDBVersion() == 4) {
            this.db.executeSimpleSQL("ALTER TABLE flights ADD COLUMN optleague string")
            this.db.executeSimpleSQL("ALTER TABLE flights ADD COLUMN opttype string")
            this.db.executeSimpleSQL("ALTER TABLE flights ADD COLUMN optdistance real")
            this.db.executeSimpleSQL("ALTER TABLE flights ADD COLUMN optpoints real")
            this.db.executeSimpleSQL("UPDATE version SET version=5");
            
            return true;
        }
	return false;
    },

    // Return default directory for gipsy files
    getDefaultDir : function() {
	var dirsvc = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
	if (this.OS == 'WINNT')
		var appdir = dirsvc.get('Pers', Components.interfaces.nsILocalFile);
	else
		var appdir = dirsvc.get('Home', Components.interfaces.nsILocalFile);
	// For other directories see:
	// http://mxr.mozilla.org/mozilla/source/xpcom/io/nsDirectoryServiceDefs.h
	appdir.appendRelativePath(GipsyDirectory);

	return appdir;
    },

    // Return version of database
    getDBVersion : function() {
	var version = 0;
	try {
	    var statement = this.db.createStatement("SELECT version FROM version");
	    statement.executeStep();
	    version = statement.getInt32(0);
	} finally { statement.reset(); }

	return version;
    },

    // Return true if the DB version is OK, otherwise false
    checkDBVersion : function() 
    {
	if (this.getDBVersion() == DBVERSION)
	    return true;
	return false;
    },

    // Create tables in the database
    createTables : function() {
	// Table of flights
	this.db.executeSimpleSQL('CREATE TABLE flights (file text primary key, pilot text, date integer, \
                                  glider text, biplace integer, country text, \
                                  site text, xcontestid text, synchro integer, landing text,\
                                  optleague string, opttype string, optdistance real, optpoints real)');
	// Table of sites
	this.db.executeSimpleSQL('CREATE TABLE sites (country text, site text, lat real, lon real, alt real)');

	// Table of people/gliders
	this.db.executeSimpleSQL('CREATE TABLE history (pilot text, glider text, biplace integer, faiclass integer, xcontestid text, lastactive text, gpsunitid integer, longname text, igccode text, xcontest_claim integer)');
	
	// Table of xcontest urls TODO: synchronize from server
	this.db.executeSimpleSQL('CREATE TABLE xc_url (id integer primary key, name test, url integer)');
	this.db.executeSimpleSQL("INSERT INTO xc_url(id, name, url) VALUES (1, 'World XContest', 'http://www.xcontest.org/world/en/flights/detail:')");

	// Table of flights entered into xcontest
	this.db.executeSimpleSQL('CREATE TABLE xcontest (file text, id integer)');

	// Table of downloaded tracklog parts (starting time, gpsunitid, lat, lon)
	this.db.executeSimpleSQL('CREATE TABLE parts (time integer, lat real, lon real)');
	this.db.executeSimpleSQL('CREATE INDEX part_idx on parts(time)');

	// Create table with version
	this.db.executeSimpleSQL('CREATE TABLE version (version integer)');
	this.db.executeSimpleSQL('INSERT INTO version VALUES(' + DBVERSION + ')');
	// Configuration table
	this.db.executeSimpleSQL('CREATE TABLE config (key text, value text)');
    },

    getIGCFile : function(fname) {
	var file = this.appdir.clone().QueryInterface(Components.interfaces.nsILocalFile);
	var subdirs = fname.split('/');
	for (var i=0; i < subdirs.length; i++)
		file.appendRelativePath(subdirs[i]);
	return file;	    
    },
        
    // Return full path to the IGC file
    getFullIGCPath : function(fname) 
    {
	return this.getIGCFile(fname).path;
    },
    // Load tracklog from file & return the tlog object
    loadTracklog : function(fname) 
    {
	if (!fname)
	    return null;
	    
	var file = this.getIGCFile(fname);
	var tlog = Components.classes["@pgweb.cz/Gipsy/GPSIGC;1"].createInstance(Components.interfaces.IGPSIGC);
	try {
	    tlog.igcLoad(file);
	} catch (e) {
	    return null;
	}
	return tlog;
    },
    // Load optimization from file
    loadOptimization : function(fname)
    {
        if (!fname)
            return null;

        var file = this.getIGCFile(fname + '.opt');
        if (!file.exists())
            return null;
        try {
            var data = "";  
            var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].
                                    createInstance(Components.interfaces.nsIFileInputStream);
            var cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"].  
                                    createInstance(Components.interfaces.nsIConverterInputStream);  
            fstream.init(file, -1, 0, 0);  
            cstream.init(fstream, "UTF-8", 0, 0); // you can use another encoding here if you wish  

            let (str = {}) {  
                cstream.readString(-1, str); // read the whole file and put it in str.value  
                data = str.value;  
            }
            cstream.close(); // this closes fstream
            
            if (JSON)
                return JSON.parse(data);
            // Fall back on unsecure eval
            return eval('(' + data + ')');
        } catch (e) {
            dump(e);
            return null;
        }
    },

    recursive_scan_igc : function(dir, dname) {
	var filelist = [];

	var diriter = dir.directoryEntries;
	while (diriter.hasMoreElements()) {
	    var file = diriter.getNext().QueryInterface(Components.interfaces.nsILocalFile);
	    
	    if (file.isDirectory()) {
		filelist = filelist.concat(this.recursive_scan_igc(file, dname + file.leafName + '/'));
	    } else if (file.leafName.toUpperCase().search('.IGC$') != -1) {
		filelist.push(dname + file.leafName);
	    }
	}
	return filelist;
    },

    // Rescan directory of IGC files, remove non-existent files from database,
    // add new files to database

    // Ugly hack - the thing is just going to run very long sometimes, make it process
    // one file at a time and return the iterator for next call
    // begin transaction on first call and abort on last...
    rescanDir : function (filelist)
    {
	if (filelist == null) {
	    filelist = this.recursive_scan_igc(this.appdir, '');

	    // Remove non-existing files from database
	    var existing_files = this.getFlightFiles();
	    for (var i=0; i < filelist.length; i++) {
		var fname = filelist[i];
		var idx = existing_files.indexOf(fname);
		if (idx != -1)
		    existing_files.splice(idx,1);
	    }
	    for (var i=0; i < existing_files.length; i++) {
		this.deleteFlightDb(existing_files[i]);
	    }
	}

	if (filelist.length) {
	    var fname = filelist[0];

            // If file does not exist in db, add it
            var flightinfo = this.getFlightFile(fname); 
            if (flightinfo == null) {
                try {
                    var tlog = this.loadTracklog(fname);
                    if (tlog == null)
                        throw "Error loading IGC tracklog" + fname

                    var dinfo = {
                        synchro: this.SYNCHRO_NONE,
                        site : tlog.igcGetParam('site'),
                        country : tlog.igcGetParam('country'),
                        biplace : tlog.igcGetParam('biplace') ? true : false
                    };
                    if (tlog.igcGetParam('xcontestid')) {
                        dinfo.xcontestid = tlog.igcGetParam('xcontestid');
                        dinfo.synchro = this.SYNCHRO_DONE;
                    }
                    // Try to guess country
                    if (dinfo.country == '--') {
                        var start = citydb.query_point(tlog.igcPoint(0));
                        if (start)
                            dinfo.country = start.country;
                    }
                    // Save to database
                    this.addNewIgc(tlog, fname, dinfo, false);

                    // Add link to xcontest
                    if (dinfo.synchro == this.SYNCHRO_DONE)
                        this.markFlightContest(fname, 1);
                    
                    this.updateFlightOptimization(fname);
                } catch (e) { 
                    Components.utils.reportError('Failed import of IGC file: ' + fname);
                    Components.utils.reportError(e);
                } // Ignore invalid IGC files
            } else if (!flightinfo.optleague) {
                // Try to load optimization if it isn't already loaded
                this.updateFlightOptimization(fname);
            }
            
	    filelist.splice(0, 1);
	    if (filelist.length)
		return filelist;
	}
	return null;
    } ,
    
    // Update database information regarding flight optimization
    updateFlightOptimization : function(fname) {
        try {
            var score  = this.loadOptimization(fname)['drawScore'];
        } catch (e) {
            return;
        };
        var query = 'UPDATE flights SET optleague=?2, opttype=?3, optdistance=?4, optpoints=?5 WHERE file=?1';
        var statement = this.db.createStatement(query);
        statement.bindStringParameter(0, fname);
        statement.bindStringParameter(1, score.scoreLeague);
        statement.bindStringParameter(2, score.scoreShape);
        statement.bindDoubleParameter(3, score.scoreDistance);
        statement.bindDoubleParameter(4, score.scorePoints);
        statement.execute();
    },
    
    // Mark flight as being part of a contest
    markFlightContest : function(fname, id) {
	var statement = this.db.createStatement("INSERT INTO xcontest (file, id) VALUES (?1, ?2)");
	statement.bindStringParameter(0, fname);
	statement.bindInt32Parameter(1, id);
	statement.execute();
    },

    // Return list of contests
    // If filename specified, return list of contests that
    // the file participates
    getContests : function(fname) {
	var statement;
	if (fname == null)
	    statement = this.db.createStatement("SELECT name,url,id FROM xc_url");
	else {
	    statement = this.db.createStatement("SELECT name,url,xc_url.id FROM xc_url,xcontest WHERE xc_url.id=xcontest.id AND file=?1");
	    statement.bindStringParameter(0, fname);
	}
	var result=[];
	try {
	    while (statement.executeStep()) {
		result.push({
		      name: statement.getString(0),
		      url : statement.getString(1),
		      id : statement.getInt32(2)
		});
	    }
	} finally { statement.reset(); };

	return result;
    },

    // Get list of all flights 'fname' identifiactions
    getFlightFiles : function() 
    {
	var statement = this.db.createStatement("SELECT file FROM flights");
	var result = [];
	try {
	    while (statement.executeStep()) {
		result.push(statement.getString(0));
	    }
	} finally {
	    statement.reset();
	}
	return result;
    },

    notifyObservers : function(subject, topic, data) {
	var obsvc = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
	obsvc.notifyObservers(subject, topic, data);
	
    },
    
    // Delete IGC file from filesystem
    deleteFlightFile : function(fname) {
	var file = this.getIGCFile(fname);
	file.remove(false);
    },

    // Delete record from flight database of given fname
    deleteFlightDb : function(fname)
    {
	var statement = this.db.createStatement("DELETE FROM flights WHERE file=?1");
	statement.bindStringParameter(0, fname);
	statement.execute();

	this.notifyObservers(null, "gps_dbremoveigc", fname);
	this.notifyObservers(null, "gps_syncupdate", fname);
    },

    // Make filename according to preferences (long vs. short)
    make_fname : function(tlog, flightnum, dinfo) {
	var date = new Date(tlog.igcPoint(0).time);
	var fname;
	
	var igccode = dinfo.igccode;
	if (!igccode)
	    igccode = tlog.igcGetParam('unique_id');
	else
	    while (igccode.length < 3)
		igccode += 'X';

	if (dinfo.longname == 'long') {
	    fname = sprintf("%4d-%02d-%02d-%s-%s-%02d.igc",
			    1900+date.getYear(), date.getUTCMonth()+1, 
			    date.getUTCDate(), 'XPG', igccode, flightnum);
	} else if (dinfo.longname == 'long_site') {
	    if (flightnum == 1)
		fname = sprintf("%4d-%02d-%02d-%s.igc",
				1900+date.getYear(), date.getUTCMonth()+1, 
				date.getUTCDate(), dinfo.site);
	    else
		fname = sprintf("%4d-%02d-%02d-%s-%02d.igc",
				1900+date.getYear(), date.getUTCMonth()+1, 
				date.getUTCDate(), dinfo.site, flightnum);
	} else {
	    var month = date.getUTCMonth() + 1;
	    if (month > 9)
		month = chr(ord('A') + (month-10));
	    var day = date.getUTCDate();
	    if (day > 9)
		day = chr(ord('A') + (day-10));
	    var fnum = flightnum;
	    if (fnum > 9)
		fnum = chr(ord('A') + (fnum-10));
	    fname = (date.getYear() % 10).toString() + month + day + 'X' + igccode + fnum + '.IGC';
	}
	
	var pilot = dinfo.pilot.replace('/', '_');
	if (get_bool_pref('savesubdirs')) 
	    return pilot + '/' +(1900+date.getYear()) + '/' + fname;
	else
	    return fname;
    },

    // Return file object suitable for IGC save
    saveIgcFile : function (tlog, dinfo) 
    {
	var dir = this.appdir.clone();
	dir = dir.QueryInterface(Components.interfaces.nsILocalFile);

	var fname = this.make_fname(tlog, 1, dinfo);
	var subdirs = fname.split('/');
	
	for (var i=0; i < subdirs.length - 1; i++) {
	    dir.appendRelativePath(subdirs[i]);
	    if (!dir.exists())
		dir.create(dir.DIRECTORY_TYPE, 0755);
	}

	var flightnum = 1;
	while (1) {
	    // Generate fname once again, this time with correct flightnum
	    fname = this.make_fname(tlog, flightnum, dinfo);
	    subdirs = fname.split('/');
	    var basename = subdirs[subdirs.length - 1];

	    var vfile = dir.clone();
	    vfile = vfile.QueryInterface(Components.interfaces.nsILocalFile);

	    vfile.appendRelativePath(basename);
	    if (! vfile.exists()) {
		tlog.igcSave(vfile);
		return fname;
	    }
	    flightnum++;
	}
    } ,

    updateIgcInfo : function(fname, dinfo) {
	var dtypes = {
	    'site' : 'bindStringParameter',
	    'landing' : 'bindStringParameter',
	    'country' : 'bindStringParameter',
	    'xcontestid' : 'bindStringParameter',
	    'pilot' : 'bindStringParameter',
	    'glider' : 'bindStringParameter',
	    'biplace' : 'bindInt32Parameter',
	    'synchro' : 'bindInt32Parameter'
	}
	var fields = [];
	var i = 2;
	for (var key in dinfo) {
	    fields.push(key + '=' + '?' + i);
	    i = i + 1;
	}
	var query = 'UPDATE flights SET ' + fields.join(',') + ' WHERE file=?1';
	var statement = this.db.createStatement(query);
	statement.bindStringParameter(0, fname);
	i = 1;
	for (var key in dinfo) {
	    statement[dtypes[key]](i, dinfo[key]);
	    i = i + 1;
	}
	statement.execute();

	this.notifyObservers(null, "gps_dbupdateigc", fname);
    },

    // Return text elegible as landing
    getLanding : function(tlog) {
	var landing = citydb.query_point(tlog.igcPoint(tlog.igcPointCount()-1));
	if (landing)
	    landing = sprintf('%s (%s)', landing.city, format_km(landing.distance));
	return landing;
    },

    // Add flight to database
    // overwrite - manually entered information, overwrite in database
    addNewIgc : function(tlog, fname, dinfo, overwrite) 
    {
	var statement = this.db.createStatement("INSERT INTO flights (file, pilot, date, glider, biplace, country, site, xcontestid, synchro, landing) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)");
	statement.bindStringParameter(0, fname);
	statement.bindStringParameter(1, tlog.igcGetParam("pilot"));
	statement.bindInt64Parameter(2, tlog.igcPoint(0).time / 1000);
	statement.bindStringParameter(3, tlog.igcGetParam("glider"));
	statement.bindInt32Parameter(4, tlog.igcGetParam("biplace") ? 1 : 0);
	statement.bindStringParameter(5, dinfo.country);
	statement.bindStringParameter(6, dinfo.site);
	if (dinfo.synchro != this.SYNCHRO_NONE) {
	    statement.bindStringParameter(7, dinfo.xcontestid);
	    statement.bindInt32Parameter(8, dinfo.synchro);
	} else {
	    statement.bindNullParameter(7);
	    statement.bindInt32Parameter(8, this.SYNCHRO_NONE);
	}
	if (!dinfo.landing) 
	    dinfo.landing = this.getLanding(tlog);

	if (dinfo.landing == null)
	    statement.bindNullParameter(9);
	else
	    statement.bindStringParameter(9, dinfo.landing);

	statement.execute();

	if (dinfo.country && dinfo.site)
	    this.addSite(tlog.igcPoint(0), dinfo.country, dinfo.site, overwrite);

	// Notify observers
	this.notifyObservers(tlog, "gps_dbnewigc", fname);
	this.notifyObservers(null, "gps_syncupdate", fname);
    } ,

    // Return all flights
    getFlights : function() 
    {
	var statement = this.db.createStatement("SELECT file,pilot,date,glider,site,country FROM flights ORDER BY date");
	var result = [];
	try {
	    while (statement.executeStep()) {
		var value = {
		    file : statement.getString(0),
		    pilot : statement.getString(1), 
		    date : statement.getInt64(2),
		    glider : statement.getString(3),
		    site : statement.getString(4),
		    country : statement.getString(5)
		}
		result.push(value);
	    }
	} finally {
	    statement.reset();
	}
	return result;
    } ,

    // Fetch flight information from database given the igc filename
    getFlightFile : function(fname)
    {
	var statement = this.db.createStatement("SELECT file, date, pilot, glider, country, site, xcontestid,\
                                                 landing, synchro, biplace, optleague, opttype, optdistance, optpoints \
                                                 FROM flights WHERE file=?1");
	statement.bindStringParameter(0, fname);

	var result = null;
	try {
            result = this.createFlightQueryResult(statement)[0];
	} finally {
	    statement.reset();
	}
	return result;
    } ,

    // Get distinct Months with some active flights
    getDistinctMonths : function(pilot) {
	var query = 'SELECT strftime("%Y-%m", date, "unixepoch", "localtime"), strftime("%Y", date, "unixepoch", "localtime"), count(*) FROM flights XXX GROUP BY strftime("%Y-%m", date, "unixepoch", "localtime"),strftime("%Y", date, "unixepoch", "localtime") ORDER BY 1 desc';

	var filter = '';
	var bfunc = function() {};
	if (pilot != null) {
	    filter = 'WHERE pilot=?1';
	    bfunc = function(st) {  st.bindStringParameter(0, pilot); };
	} 
	query = query.replace('XXX', filter);
	var statement = this.db.createStatement(query);
	bfunc(statement);

	var result = [];
	try {
	    while (statement.executeStep())
		result.push([statement.getString(0), statement.getInt32(1),
			     statement.getInt32(2)]);
	} finally {
	    statement.reset();
	}
	return result;
    } ,

    createFlightQueryResult : function (statement) {
        var result = [];
        try {
            while (statement.executeStep()) {
                result.push({
                        file : statement.getString(0),
                        date : statement.getInt64(1) * 1000,
                        pilot : statement.getString(2),
                        glider : statement.getString(3),
                        country : statement.getString(4),
                        site : statement.getString(5),
                        xcontestid : statement.getString(6),
                        landing : statement.getString(7),
                        synchro : statement.getInt32(8),
                        biplace: statement.getInt32(9) ? true : false,
                        optleague : statement.getString(10),
                        opttype : statement.getString(11),
                        optdistance : statement.getDouble(12),
                        optpoints : statement.getDouble(13)
                });
            }
        } finally {
            statement.reset();
        }
        return result;
    },

    // Get flights in given month
    getFlightsInMonth : function(month, pilot) {
	var query = 'SELECT file, date, pilot, glider, country, site, xcontestid, \
                            landing, synchro, biplace, optleague, opttype, optdistance, optpoints \
                     FROM flights \
                     WHERE strftime("%Y-%m", date, "unixepoch", "localtime")=?1 XXX \
                     ORDER BY strftime("%Y-%m-%d", date, "unixepoch", "localtime") DESC, ltrim(lower(pilot),\'aüöäÜÖÄbcčČdďĎeéěÉĚfghiíÍjklmnňňoóÓpqrřŘsšŠtťŤuúůÚvwxyýÝzžŽ\'), date DESC';

	var filter = '';var bfunc = function() {};
	if (pilot != null) {
	    filter = 'AND pilot=?2';
	    bfunc = function(st) {  st.bindStringParameter(1, pilot); };
	} 

	query = query.replace('XXX', filter);
	var statement = this.db.createStatement(query);
	bfunc(statement);
	statement.bindStringParameter(0, month);
        
        return this.createFlightQueryResult(statement);
    }, 

    // Get flights on given site
    getFlightsOnSite : function(country, site, pilot) {
	var query = 'SELECT file, date, pilot, glider, country, site, xcontestid, \
                    landing, synchro, biplace, optleague, opttype, optdistance, optpoints \
                    FROM flights \
                    WHERE country=?1 AND site=?2 XXX ORDER BY date DESC';

	var filter = ''; var bfunc = function() {};
	if (pilot != null) {
	    filter = 'AND pilot=?3';
	    bfunc = function(st) {  st.bindStringParameter(2, pilot); };
	} 	

	query = query.replace('XXX', filter);
	var statement = this.db.createStatement(query);
	bfunc(statement);
	
	statement.bindStringParameter(0, country);
	statement.bindStringParameter(1, site);

        return this.createFlightQueryResult(statement);
    }, 

    getDistinctPilots : function() {
	var statement = this.db.createStatement('SELECT distinct(pilot) FROM flights ORDER BY 1');
	var result = [];
	try {
	    while (statement.executeStep()) {
		result.push(statement.getString(0));
	    }
	} finally { statement.reset(); }
	return result;
    },

    getDistinctCountries : function(pilot) {
	var query = 'SELECT country,count(*) FROM flights XXX GROUP BY country ORDER BY 1';

	var filter = '';var bfunc = function() {};
	if (pilot != null) {
	    filter = 'WHERE pilot=?1';
	    bfunc = function(st) {  st.bindStringParameter(0, pilot); };
	} 
	query = query.replace('XXX', filter);
	var statement = this.db.createStatement(query);
	bfunc(statement);

	var result = [];
	try {
	    while (statement.executeStep())
		result.push([statement.getString(0), statement.getInt32(1)]);
	} finally {
	    statement.reset();
	}
	return result;
    },

    // Return sites where we have a flight logged
    getDistinctSites : function(country, pilot) {
	var query = 'SELECT site,count(*) FROM flights WHERE country=?1 XXX GROUP BY site ORDER BY 1';

	var filter = '';var bfunc = function() {};
	if (pilot != null) {
	    filter = 'AND pilot=?2';
	    bfunc = function(st) {  st.bindStringParameter(1, pilot); };
	} 
	query = query.replace('XXX', filter);
	var statement = this.db.createStatement(query);

	bfunc(statement);
	statement.bindStringParameter(0, country);
	
	var result = [];
	try {
	    while (statement.executeStep())
		result.push([statement.getString(0), statement.getInt32(1)]);
	} finally {
	    statement.reset();
	}
	return result;
    } ,

    // Remove site from table of sites
    removeSite : function(basepoint) {
	var statement = this.db.createStatement('DELETE FROM sites WHERE lat=?1 AND lon=?2');
	statement.bindDoubleParameter(0, basepoint.lat);
	statement.bindDoubleParameter(1, basepoint.lon);
	statement.execute();
    } ,

    // Add site and coordinates to the site database
    addSite : function(basepoint, country, site, overwrite) {
	// Find if there is a site nearby
	var sites = this.getNearestSites(basepoint);

	// Do not modify for same start
	if (sites.length > 1 && basepoint.distance(sites[0].point) < this.SITE_DISTANCE) {
	    if (!overwrite)
		return;
	    if (country == sites[0].country && site == sites[0].site)
		return;
	}

	// If it is and has different name, remove it and replace
	if (sites.length > 1 && basepoint.distance(sites[0].point) < this.SITE_DISTANCE
	    && (country != sites[0].country || site != sites[0].site)) {
	    this.removeSite(sites[0].point);
	}
	// Write to the database
	var statement = this.db.createStatement('INSERT INTO sites (country,site,lat,lon,alt) VALUES (?1, ?2, ?3, ?4, ?5)');
	statement.bindStringParameter(0, country);
	statement.bindStringParameter(1, site);
	statement.bindDoubleParameter(2, basepoint.lat);
	statement.bindDoubleParameter(3, basepoint.lon);
	statement.bindDoubleParameter(4, basepoint.alt);
	statement.execute();
    } ,

    // Return {country,site,point,distance} sorted by distance from basepoint
    getNearestSites : function(basepoint) {
	// Select sites that are maximum of 1 degree far
	var statement = this.db.createStatement('SELECT country, site, lat, lon, alt FROM sites WHERE lat>?1 - 1 AND lat < ?1 + 1 AND lon>?2 - 1 AND lon<?2 + 1');
	statement.bindDoubleParameter(0, basepoint.lat);
	statement.bindDoubleParameter(1, basepoint.lon);

	var result = [];
	while (statement.executeStep()) {
	    var point = GPSPoint(statement.getDouble(2), statement.getDouble(3));
	    var distance = point.distance(basepoint);
	    result.push({
		country : statement.getString(0),
		site : statement.getString(1),
		point : point,
		distance : distance
		});
	}
	result.sort(function(a,b) {
	    if (a.distance < b.distance)
		return -1;
	    else if (a.distance > b.distance)
		return 1;
	    return 0;
	});
	// Remove duplicate names, favour smaller distance
	for (var i=1; i < result.length;i++) {
	    if (result[i-1].country == result[i].country
		&& result[i-1].site == result[i].site) {
		result.splice(i, 1);
		i--;
	    }
	}
	return result;
    } ,

    // Add information from input box into database
    addInputInfo: function(info) {
	var statement = this.db.createStatement('DELETE FROM history WHERE pilot=?1 AND gpsunitid=?2');
	statement.bindStringParameter(0, info.pilot);
	statement.bindInt32Parameter(1, info.gpsunitid);
	statement.execute();
	// Pridej informace do databaze
	var statement = this.db.createStatement("INSERT INTO history (pilot, glider, biplace, xcontestid, lastactive, gpsunitid, faiclass, longname, igccode, xcontest_claim) VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5, ?6, ?7, ?8, ?9)");
	statement.bindStringParameter(0, info.pilot);
	statement.bindStringParameter(1, info.glider);
	statement.bindInt32Parameter(2, info.biplace ? 1 : 0);
	if (info.xcontestid == null)
	    statement.bindNullParameter(3);
	else
	    statement.bindStringParameter(3, info.xcontestid);
	
	statement.bindInt32Parameter(4, info.gpsunitid);
	statement.bindInt32Parameter(5, info.faiclass);
	statement.bindStringParameter(6, info.longname);
	statement.bindStringParameter(7, info.igccode);
	statement.bindInt32Parameter(8, info.xcontest_claim ? 1 : 0);
	statement.execute();
    } , 
    // Return suggested information for pilot/glider/etc. input box
    getPilotByGps: function(gpsunitid) {
	var statement = this.db.createStatement('SELECT max(lastactive) FROM history WHERE gpsunitid=?1 ORDER BY lastactive DESC');
	statement.bindInt32Parameter(0, gpsunitid);

	var result = null;
	try {
	    if (statement.executeStep())
		result = statement.getString(0);
	} finally {
	    statement.reset();
	}
	return result;
    } ,

    // Return list of pilots from history
    getInputPilots : function() {
	var statement = this.db.createStatement('SELECT pilot,max(lastactive) FROM history GROUP BY pilot ORDER BY 1');
	var result = [];
	try {
	    while (statement.executeStep())
		result.push([statement.getString(0), statement.getString(1)]);
	} finally { statement.reset(); }
	return result;
    } ,

    // Get complete info from history about pilot
    getPilotHistoryInfo : function(histtime) {
	var statement = this.db.createStatement('SELECT pilot, glider, xcontestid, biplace, faiclass, longname, igccode, xcontest_claim FROM history WHERE lastactive=?1  ORDER BY lastactive DESC');
	statement.bindStringParameter(0, histtime);
	
	var result = null;
	try {
	    if (statement.executeStep())
		result = {
		    pilot : statement.getString(0),
		    glider : statement.getString(1),
		    xcontestid : statement.getString(2),
		    biplace : statement.getInt32(3),
		    faiclass : statement.getInt32(4),
		    longname : statement.getString(5),
		    igccode : statement.getString(6),
		    xcontest_claim : statement.getInt32(7)
		};
	} finally { statement.reset(); }
	return result;
	
    } ,

    // Add point identifying downloaded track (TODO: clear old points?)
    addTrackPartPoint : function(point) {
	var statement = this.db.createStatement('INSERT INTO parts (time,lat,lon) VALUES (?1, ?2, ?3)');
	statement.bindInt64Parameter(0, point.time / 1000);
	statement.bindDoubleParameter(1, point.lat);
	statement.bindDoubleParameter(2, point.lon);
	statement.execute();
    },


    // Return true if subtrack starting with time was entered into database
    isTrackInDb : function(point) {
	var statement = this.db.createStatement('SELECT time FROM parts WHERE time=?1 AND lat=?2 AND lon=?3');
	statement.bindInt64Parameter(0, point.time / 1000);
	statement.bindDoubleParameter(1, point.lat);
	statement.bindDoubleParameter(2, point.lon);
	
	var result = false;
	try {
	    if (statement.executeStep())
		result = true;
	} finally { statement.reset(); }

	return result;
    }, 
    
    // Update synchronization flag
    updateSynchroState : function(fname, state) {
	var statement = this.db.createStatement('UPDATE flights SET synchro=?1 WHERE file=?2');
	statement.bindInt32Parameter(0, state);
	statement.bindStringParameter(1, fname);
	statement.execute();

	this.notifyObservers(null, "gps_syncupdate", fname);
    },

    // List of SYNCHRO_ENABLED(not yet synced) filenames
    synchroFlights : function() {
	var statement = this.db.createStatement('SELECT file FROM flights WHERE synchro=?1');
	statement.bindInt32Parameter(0, this.SYNCHRO_ENABLED);
	var result = [];
	try {
	    while (statement.executeStep())
		result.push(statement.getString(0));
	} finally { statement.reset(); }
	return result;
    },

    // Functions for ensuring that there is at most 1 process
    // claiming flight

    ticket : false,

    getClaimTicket : function() {
	if (this.ticket)
	    return false;
	this.ticket = true;
	return true;
    },

    putClaimTicket : function() {
	this.ticket = false;
    },

    // Config functions
    add_config : function(key, value) {
	if (this.get_config(key) == null)
	    var statement = this.db.createStatement('INSERT INTO config VALUES (?1, ?2)');
	else 
	    var statement = this.db.createStatement('UPDATE config SET value=?2 WHERE key=?1');
	statement.bindStringParameter(0, key);
	statement.bindStringParameter(1, value);
	statement.execute();
    },

    get_config : function(key) {
	var statement = this.db.createStatement('SELECT value FROM config WHERE key=?1');
	statement.bindStringParameter(0, key);

	var value = null;
	try {
	    if (statement.executeStep())
		value = statement.getString(0);
	} finally { statement.reset(); }
	return value;
    }
}



//=================================================
// Note: You probably don't want to edit anything
// below this unless you know what you're doing.
//
// Factory
var GPSStoreFactory = {
  singleton: null,
  createInstance: function (aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    if (this.singleton == null)
      this.singleton = new GPSStore();
    return this.singleton.QueryInterface(aIID);
  }
};

// Module
var GPSStoreModule = {
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
      return GPSStoreFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

//module initialization
function NSGetModule(aCompMgr, aFileSpec) { return GPSStoreModule; }
