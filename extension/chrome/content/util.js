/*
**  sprintf.js -- POSIX sprintf(3) style formatting function for JavaScript
**  Copyright (c) 2006-2007 Ralf S. Engelschall <rse@engelschall.com>
**  Partly based on Public Domain code by Jan Moesen <http://jan.moesen.nu/>
**  Licensed under GPL <http://www.gnu.org/licenses/gpl.txt>
**
*/

/*  make sure the ECMAScript 3.0 Number.toFixed() method is available  */
if (typeof Number.prototype.toFixed != "undefined") {
    (function(){
        /*  see http://www.jibbering.com/faq/#FAQ4_6 for details  */
        function Stretch(Q, L, c) {
            var S = Q
            if (c.length > 0)
                while (S.length < L)
                    S = c+S;
            return S;
        }
        function StrU(X, M, N) { /* X >= 0.0 */
            var T, S;
            S = new String(Math.round(X * Number("1e"+N)));
            if (S.search && S.search(/\D/) != -1)
                return ''+X;
            with (new String(Stretch(S, M+N, '0')))
                return substring(0, T=(length-N)) + '.' + substring(T);
        }
        function Sign(X) {
            return X < 0 ? '-' : '';
        }
        function StrS(X, M, N) {
            return Sign(X)+StrU(Math.abs(X), M, N);
        }
        Number.prototype.toFixed = function (n) { return StrS(this, 1, n) };
    })();
}

/*  the sprintf() function  */
function sprintf() {
    /*  argument sanity checking  */
    if (!arguments || arguments.length < 1)
        alert("sprintf:ERROR: not enough arguments");

    /*  initialize processing queue  */
    var argumentnum = 0;
    var done = "", todo = arguments[argumentnum++];

    /*  parse still to be done format string  */
    var m;
    while ((m = /^([^%]*)%(\d+$)?([#0 +'-]+)?(\*|\d+)?(\.\*|\.\d+)?([%diouxXfFcs])(.*)$/.exec(todo))) {
        var pProlog    = m[1],
            pAccess    = m[2],
            pFlags     = m[3],
            pMinLength = m[4],
            pPrecision = m[5],
            pType      = m[6],
            pEpilog    = m[7];

        /*  determine substitution  */
        var subst;
        if (pType == '%')
            /*  special case: escaped percent character  */
            subst = '%';
        else {
            /*  parse padding and justify aspects of flags  */
            var padWith = ' ';
            var justifyRight = true;
            if (pFlags) {
                if (pFlags.indexOf('0') >= 0)
                    padWith = '0';
                if (pFlags.indexOf('-') >= 0) {
                    padWith = ' ';
                    justifyRight = false;
                }
            }
            else
                pFlags = "";

            /*  determine minimum length  */
            var minLength = -1;
            if (pMinLength) {
                if (pMinLength == "*") {
                    var access = argumentnum++;
                    if (access >= arguments.length)
                        alert("sprintf:ERROR: not enough arguments");
                    minLength = arguments[access];
                }
                else
                    minLength = parseInt(pMinLength, 10);
            }

            /*  determine precision  */
            var precision = -1;
            if (pPrecision) {
                if (pPrecision == ".*") {
                    var access = argumentnum++;
                    if (access >= arguments.length)
                        alert("sprintf:ERROR: not enough arguments");
                    precision = arguments[access];
                }
                else
                    precision = parseInt(pPrecision.substring(1), 10);
            }

            /*  determine how to fetch argument  */
            var access = argumentnum++;
            if (pAccess)
                access = parseInt(pAccess.substring(0, pAccess.length - 1), 10);
            if (access >= arguments.length)
                alert("sprintf:ERROR: not enough arguments");

            /*  dispatch into expansions according to type  */
            var prefix = "";
            switch (pType) {
                case 'd':
                case 'i':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0;
                    subst = subst.toString(10);
                    if (pFlags.indexOf('#') >= 0 && subst >= 0)
                        subst = "+" + subst;
                    if (pFlags.indexOf(' ') >= 0 && subst >= 0)
                        subst = " " + subst;
                    break;
                case 'o':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0;
                    subst = subst.toString(8);
                    break;
                case 'u':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0;
                    subst = Math.abs(subst);
                    subst = subst.toString(10);
                    break;
                case 'x':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0;
                    subst = subst.toString(16).toLowerCase();
                    if (pFlags.indexOf('#') >= 0)
                        prefix = "0x";
                    break;
                case 'X':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0;
                    subst = subst.toString(16).toUpperCase();
                    if (pFlags.indexOf('#') >= 0)
                        prefix = "0X";
                    break;
                case 'f':
                case 'F':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0.0;
                    subst = 0.0 + subst;
                    if (precision > -1) {
                        if (subst.toFixed)
                            subst = subst.toFixed(precision);
                        else {
                            subst = (Math.round(subst * Math.pow(10, precision)) / Math.pow(10, precision));
                            subst += "0000000000";
                            subst = subst.substr(0, subst.indexOf(".")+precision+1);
                        }
                    }
                    subst = '' + subst;
                    if (pFlags.indexOf("'") >= 0) {
                        var k = 0;
                        for (var i = (subst.length - 1) - 3; i >= 0; i -= 3) {
                            subst = subst.substring(0, i) + (k == 0 ? "." : ",") + subst.substring(i);
                            k = (k + 1) % 2;
                        }
                    }
                    break;
                case 'c':
                    subst = arguments[access];
                    if (typeof subst != "number")
                        subst = 0;
                    subst = String.fromCharCode(subst);
                    break;
                case 's':
                    subst = arguments[access];
                    if (precision > -1)
                        subst = subst.substr(0, precision);
                    if (typeof subst != "string")
                        subst = "";
                    break;
            }

            /*  apply optional padding  */
            var padding = minLength - subst.toString().length - prefix.toString().length;
            if (padding > 0) {
                var arrTmp = new Array(padding + 1);
                if (justifyRight)
                    subst = arrTmp.join(padWith) + subst;
                else
                    subst = subst + arrTmp.join(padWith);
            }

            /*  add optional prefix  */
            subst = prefix + subst;
        }

        /*  update the processing queue  */
        done = done + pProlog + subst;
        todo = pEpilog;
    }
    return (done + todo);
}

function chr(c) {
      var h = c . toString (16);
      h = unescape ('%'+h);
      return h;
} 

function ord(c) {
      return c.charCodeAt(0);
}

function get_bool_pref(pref) {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	prefs = prefs.getBranch("extensions.gipsy.");	
	return prefs.getBoolPref(pref);
}

var cvt = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
cvt.charset = 'utf8';

function get_string_pref(pref) {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	prefs = prefs.getBranch("extensions.gipsy.");	
	return cvt.ConvertToUnicode(prefs.getCharPref(pref));
}

function set_string_pref(pref, value) {
	var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	prefs = prefs.getBranch("extensions.gipsy.");	
	return prefs.setCharPref(pref, cvt.ConvertFromUnicode(value));
}


function elem(id) {
    return document.getElementById(id);
}

// Remove all children form na element
function empty(el) {
    while ( el.childNodes.length >= 1 )
        el.removeChild(el.firstChild);
}

function _(str) {
    return elem('bundle').getString(str);
}

function format_km(dist) {
    if (get_bool_pref('metric'))
	return sprintf("%.1f km", dist / 1000);
    return sprintf("%.1f mi.", dist / 1609.344);
}

function format_km2(dist) {
    if (get_bool_pref('metric'))
        return sprintf("%.2f km", dist / 1000);
    return sprintf("%.2f mi.", dist / 1609.344);
}

function format_m(dist) {
    if (get_bool_pref('metric'))
	return sprintf("%d m", Math.round(dist));
    return sprintf("%d ft", Math.round(dist * 3.2808399));
}

function format_kmh(speed) {
    if (get_bool_pref('metric'))
        return sprintf("%.1f km/h", speed * 3.6);
    return sprintf("%.1f mph", speed * 3.6 / 1.609344);
}

function format_ms(speed) {
    if (get_bool_pref('metric'))
	return sprintf("%.1f m/s", speed);
    return sprintf("%d ft/m", Math.round(speed * 3.2808399 * 60));
}    

function findPosX(obj)
{
    var curleft = 0;
    while(1)  {
        curleft += obj.offsetLeft;
        if(!obj.offsetParent)
            break;
        obj = obj.offsetParent;
    }
    return curleft;
}

function findPosY(obj)
{
    var curtop = 0;
    while(1) {
        curtop += obj.offsetTop;
        if(!obj.offsetParent)
        break;
        obj = obj.offsetParent;
    }
    return curtop;
}

function fire_resize_event()
{
    var evobj = document.createEvent('HTMLEvents');
    evobj.initEvent('resize', false, false);
    window.dispatchEvent(evobj);
}
