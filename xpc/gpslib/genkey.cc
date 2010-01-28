#include <crypto++/default.h>
#include <crypto++/randpool.h>
#include <crypto++/rsa.h>
#include <crypto++/base64.h>
#include <crypto++/hex.h>
#include <crypto++/files.h>


using namespace std;
using namespace CryptoPP;


int main(void)
{

    // Generate rsa key
    char seed[1024];

    FILE *f = fopen("/dev/random","r");
    if (!f) {
	perror("/dev/random");
	exit(1);
    }
    fread(seed, 1024, 1, f);
    fclose(f);

    RandomPool randPool;
    randPool.Put((byte *)seed, strlen(seed));
 
    RSAES_OAEP_SHA_Decryptor priv(randPool, 1024);
    HexEncoder privFile(new FileSink("key.priv"));
    priv.DEREncode(privFile);
    privFile.MessageEnd();
    
    RSAES_OAEP_SHA_Encryptor pub(priv);
    HexEncoder pubFile(new FileSink("key.pub"));
    pub.DEREncode(pubFile);
    pubFile.MessageEnd();    
}
