/* 
 * Validator of IGC files
 */

#include <string>
#include <stdlib.h>

using namespace std;

#include "igc.h"

int main(int argc, char **argv)
{
    if (argc != 2) {
	fprintf(stderr, "Usage: %s <file.igc>\n", argv[0]);
	exit(1);
    }

    FILE * f = fopen(argv[1], "r");
    if (!f) {
	perror(argv[1]);
	exit(1);
    }
    
    // inefficient, but I'm totally lazy to write it other way
    string text;
    while (!feof(f))
	text += fgetc(f);
    fclose(f);
    
    Igc igc(text);

    if (igc.validate()) {
	printf("Valid IGC file\n"); 
	return 0;
    } else {
	printf("IGC file is INVALID\n");
	return 1;
    }
}
