/* Management of flight claiming */

var browser;
var progress;
var initialized = false;

var mstate = { step: 'login' };

const HOST = 'http://www.xcontest.org'

function get_user_password(host, user) {
    var pmanag = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
    
    var logins = pmanag.findLogins({}, host, 'http://www.xcontest.org', null);
    for (var i=0; i < logins.length; i++) {
	if (logins[i].username == user)
	    return logins[i].password;
    }

    return null;
}

function bfield(id) {
    return browser.contentDocument.getElementById(id);
}

var flightclaim = {
    tlog : null,
    dinfo : null,
    fname : null,
    wizard : null,
    ticket : false,

    login : function() {
	var dinfo = this.dinfo;
	if (bfield('login')) {
	    if (bfield('login-username')) {
		var user = dinfo.xcontestid;
		bfield('login-username').value = dinfo.xcontestid;
		var passwd = get_user_password(HOST, user);
		if (passwd == null) {
		    var params = { 'userid' : user, 'passwd' : null };
		    var res = window.openDialog("chrome://gipsy/content/passwd.xul", "",
						"chrome, dialog, modal", params).focus();
		    passwd = params['passwd'];
		    if (passwd == null)
			return null;
		}
		bfield('login-password').value = passwd;
		bfield('login').submit();
		return { step: 'goto_claim', descr : 'claim_login' };
	    } 
	    this.logout();
	    return { step: 'login', descr: 'claim_logout' };
	}
	alert('Login failed');
	this.wizard.canRewind = true;
	return null;
    },
    logout : function() {
	bfield('login').submit();
    },

    goto_claim : function() {
	// Check if we are logged in
	if (bfield('login') && !bfield('login-username')) {
	    browser.loadURI(_('synchro_url'), null, null);
	    return { step: 'fill_first_form', descr : 'claim_loadclaim' };
	}
	alert('Not logged in.');
	this.wizard.canRewind = true;
	return null;
    },

    fill_first_form : function() {
	if (!bfield('step1')) {
	    alert('Error');
	    this.wizard.canRewind = true;
	    return null;
	}
	browser.contentDocument.forms[1].elements[1].value = gstore.getFullIGCPath(this.fname);
	browser.contentDocument.forms[1].submit();
	return {step : 'fill_second_form', descr : 'claim_sendigc' };
    },

    fill_second_form : function() {
	var dinfo = this.dinfo;

	if (bfield('flight-comment') == null) {
	    alert('IGC claim - step1 failed');
	    return null;
	}

	bfield('flight-comment').value = dinfo.comment;
	bfield('flight-start').value = dinfo.site;
	// Fill in country
	for (var i=0; i < browser.contentDocument.forms[1].elements.length;i++)
	    if (browser.contentDocument.forms[1].elements[i].name == 'flight[country]') {
		var cntsel = browser.contentDocument.forms[1].elements[i];

		this.select_option(cntsel, Country_list[dinfo.country]);

		break;
	    }
	
	
	// FAI class
	fai = bfield('flight-faiclass');
	for (var i=0; i < fai.options.length; i++)
	    if (fai.options[i].value == dinfo.faiclass) {
		fai.selectedIndex = i;
		break;
	    }

	// Glider 
	this.select_option(bfield('flight-glider'), dinfo.glider);

	bfield('flight-tandem').checked = dinfo.biplace;

	return { step: 'finalize', show: true, descr : 'claim_final'};
    },

    finalize: function() {
	// TODO: Check, that the flight was claimed OK

	// TODO: Add to proper contests
	gstore.markFlightContest(this.fname, 1); // Add to xcontest for now
	gstore.updateSynchroState(this.fname, gstore.SYNCHRO_DONE);

	this.wizard.canAdvance = true;

	return null;
    },

    select_option: function(selector, option) {
	var pos = 0;
	for (var i=0; i < selector.childNodes.length; i++) {
	    var node = selector.childNodes[i];
	    if (node.nodeName == 'OPTION') {
		var text = node.childNodes[0].nodeValue;
		if (text == option) {
		    selector.selectedIndex = pos;
		    break;
		}
		pos++;
	    }
	}
    },
    
    // Remove sidepanels
    clean_style: function(sheet) {
	var remove = ['#page-inner', '#page', '#heading-section',
		      '#menu-top', '#main-box', '#main-box .in1',
		      'form#login p.errors', '.under-bar',
		      'html>body #page', '#logo', '#logo.pgwebII',
		      '#logo.xcontestII','#box-left', '#box-right', 
		      '#content', 'body.wsw', 'div.wsw', '.wsw', '.wsw p',
		      '#content-and-context', '.no-right-box #content'];
	for (var i=0; i < remove.length; i++) {
	    for (j=sheet.cssRules.length-1; j >= 0; j--)
		if (sheet.cssRules[j].selectorText == remove[i]) {
		    sheet.deleteRule(j);
		}
	}

	var hide = ['#breadcrumb-navi', ".bar", "#menu-right", ".partners",
                    '#menu-left', '#menu-top', '#footer', '#logo', '#login',
		    '#heading-section', '#logo-xcmag img'];
	for (var i=0; i < hide.length; i++) 
	    sheet.insertRule(hide[i] +  '{ display: none; }', sheet.cssRules.length);

    }
};

var listener = {
    ststop : Components.interfaces.nsIWebProgressListener.STATE_STOP,
    ststart : Components.interfaces.nsIWebProgressListener.STATE_START,
    stdoc : Components.interfaces.nsIWebProgressListener.STATE_IS_DOCUMENT,

    onStateChange : function(prog, req, flags, status) {
	if ((flags & this.ststop) && (flags & this.stdoc) && 
	    req.name != 'about:blank') {
	    
	    mstate = flightclaim[mstate.step]();
	    // Set description
	    if (mstate != null && mstate.descr) {
		var descr = elem('bundle').getString(mstate.descr);
		elem('claim_status').value = descr;
	    }
	    if (mstate == null || mstate.show) {
		try {
		    flightclaim.clean_style(browser.contentDocument.styleSheets[0]);
		} catch (e) { };
		elem('browser_vbox').selectedIndex = 1;
		progress.hidden = true;
	    }
	    if (mstate == null)
		unclaim_ticket();
	}
	if ((flags & this.ststart) && (flags & this.stdoc) &&
	    (mstate && mstate.step == 'finalize')) {
	    progress.hidden = false;
	    elem('browser_vbox').selectedIndex = 0;
	}
    },

    onProgressChange : function() {
    },

    onLocationChange : function() {
    },

    onStatusChange : function() {
    },

    onSecurityChange : function() {
    },
    QueryInterface : function(aIID) {
	if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
	    aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
	    aIID.equals(Components.interfaces.nsISupports))
	    return this;
	throw Components.results.NS_NOINTERFACE;
    }    
};

function unclaim_ticket() {
    if (flightclaim.ticket) {
	gstore.putClaimTicket();
	flightclaim.ticket = false;
    }
    window.removeEventListener('unload', unclaim_ticket, false);
}

/* Start claim flight procedure */
function claim_start() {
    // Get Ticket
    flightclaim.ticket = gstore.getClaimTicket();
    if (!flightclaim.ticket) {
	alert(elem('bundle').getString('claim_mutex'));
	flightclaim.wizard.rewind();
	return;
    }
    window.addEventListener('unload', unclaim_ticket, false);

    flightclaim.wizard.canRewind = false;
    flightclaim.wizard.canAdvance = false;

    elem('browser_vbox').selectedIndex = 0;
    elem('claim_status').value = elem('bundle').getString('claim_conn');

    browser = document.getElementById('claim_browser');
    progress = document.getElementById('claim_progress');
    mstate = { step: 'login' };

    if (!initialized) {
	browser.addProgressListener(listener, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
	initialized = true;
    }
    
    progress.hidden = false;
    browser.loadURI(HOST, null, null);
}
