#include <string>

#include "foreignigc.h"

using namespace std;

ForeignIgc::ForeignIgc(const std::string &content) : Igc(content)
{
    int state = 0;
    size_t eol;
    
    /* Reparse it again and split it into prefix, postfix and g_record sections */
    for (unsigned int i=0; i < content.size();i=eol+1) {
	eol = content.find('\n', i);
	if (eol == string::npos)
	    eol = content.size();
        string line(content.substr(i, eol - i));
        
        switch (line[0]) {
            case 'B':
            case 'I':
                state = 1;
                break;
            case 'G':
                state = 2;
            default:
                break;
        }
        switch (state) {
            case 0:
                if (content.substr(i, 2) == "HO" || content.substr(i, 2) == "HP")
                    break;
                s_prefix << content.substr(i, eol - i + 1);
                break;
            case 1:
                if (content.substr(i, 3) == "LPLT" || content.substr(i, 3) == "LOOI")
                    break;
                s_postfix << content.substr(i, eol - i + 1);
                break;
            case 2:
                s_grecord << content.substr(i, eol - i + 1);
                break;
        }
    }
}

string ForeignIgc::as_str()
{
    stringstream result;
    
    result << s_prefix.str();
    result << make_h();
    result << s_postfix.str();
    result << make_l();
    result << s_grecord.str();
    
    return result.str();
}

bool ForeignIgc::validate()
{
    return false;
}

bool ForeignIgc::gen_g_record()
{
    return false;
}
