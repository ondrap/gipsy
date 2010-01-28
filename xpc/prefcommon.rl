%%{
    machine common;
    
    action int_first { i = fc - '0'; }
    action int_next { i = 10*i + fc - '0'; }
    int = digit $int_first digit* @int_next;
    
    action string_begin { begin = fpc; }
    action string_end {
	s = string(begin, fpc - begin);
    }
    string = [^;|] >string_begin [^;|]* %string_end;
}%%
