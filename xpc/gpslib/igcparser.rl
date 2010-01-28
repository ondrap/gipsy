%%{
    machine h_parser;

    action string_begin { begin = fpc; }
    action string_end {
	if (begin)
	    s = string(begin, fpc-begin);
	else
	    s = "";
    }
    string = (any - 0)* >string_begin %string_end;

    action int_first { i = fc - '0'; }
    action int_next { i = 10*i + fc - '0'; }
    int = digit $int_first digit* @int_next;
    int2 = digit $int_first digit @int_next;
    
    htype = [FOP] @{ htype = fc; };

    action glider { 
	glider = s;

	if (glider.rfind('(') != string::npos && \
	    glider.rfind('(') == glider.size()-9 &&
	    glider.substr(glider.size()-9) == "(biplace)") {
	    biplace = true;
	    
	    size_t end_of_glider = glider.find_last_not_of(' ', glider.size()-10);
	    if (end_of_glider == string::npos)
		glider = "";
	    else
		glider = glider.substr(0, end_of_glider+1);
	}
    }

    action site {
	site = s;
	if (site.rfind('(') != string::npos &&
	    site.rfind('(') == site.size()-4 &&
	    site[site.size()-1] == ')') {
	    country = site.substr(site.size()-3,2);
	    size_t end_of_site = site.find_last_not_of(' ', site.size()-5);
	    if (end_of_site == string::npos)
		site = "";
	    else
		site = site.substr(0, end_of_site+1);
	} else
	    country = "--";
    }
    
    ### DATE
    action cleardate {
	memset(&tmv, 0, sizeof(tmv));
    }
    action date {
	if (htype != 'F') invalid_grecord = true;
	tmv.tm_year = i + 100;
	base = last = make_gmtime(&tmv);
	fret;
    }
    date := int2 >cleardate @{tmv.tm_mday=i;} 
            int2 @{tmv.tm_mon = i - 1;} int2 @date;

    ### MAIN
    action check_h {
	if (htype == 'F')
	    invalid_grecord = true;
    }
    main := "H" htype (
	  /PLTPILOT/i ":" " "* string %check_h %{pilot = s;} |
	  /GTYGLIDERTYPE/i ":" " "* string %check_h %glider |
	  /GIDGLIDERID/i ":" " "* string %check_h %{gliderid=s;} |
	  /CCLCOMPETITION CLASS/i ":" " "* string %check_h %{faiclass=s;} |
	  /SITSITE/i ":" " "* string %check_h %site |
	  /DTE/ @{ fcall date; }
	) 0 @{fbreak;};

}%%

{
    const char *begin = NULL;
    string s;
    char htype = ' ';
    int i = 0;
    struct tm tmv;
    memset(&tmv, 0, sizeof(tmv));

    int cs, top;
    int stack[2];

    %%write data noerror;

    %%write init;
    %%write exec noend;
    if (cs < h_parser_first_final && htype == 'F')
	invalid_grecord = true;
}
