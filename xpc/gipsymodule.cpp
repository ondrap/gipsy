#include "mozilla-config.h"
#include "mozilla/ModuleUtils.h"
#include "nsIClassInfoImpl.h"

#include "gipsy.h"
#include "tracklog.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(Gipsy)
NS_DEFINE_NAMED_CID(NS_GIPSY_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(Tracklog)
NS_DEFINE_NAMED_CID(NS_TRACKLOG_CID);

NS_GENERIC_FACTORY_CONSTRUCTOR(GpsPoint)
NS_DEFINE_NAMED_CID(NS_IGCPOINT_CID);

static const mozilla::Module::CIDEntry kGipsyCIDs[] = {
 { &kNS_GIPSY_CID, false, NULL, GipsyConstructor },
 { &kNS_TRACKLOG_CID, false, NULL, TracklogConstructor },
 { &kNS_IGCPOINT_CID, false, NULL, GpsPointConstructor },
 { NULL }
};

static const mozilla::Module::ContractIDEntry kGipsyContracts[] = {
  { NS_GIPSY_CONTRACTID, &kNS_GIPSY_CID },
  { NS_TRACKLOG_CONTRACTID, &kNS_TRACKLOG_CID },
  { NS_IGCPOINT_CONTRACTID, &kNS_IGCPOINT_CID },
  { NULL }
};

static const mozilla::Module::CategoryEntry kGipsyCategories[] = {
    { NULL }
};

static const mozilla::Module kGipsyModule = {
    mozilla::Module::kVersion,
    kGipsyCIDs,
    kGipsyContracts,
    kGipsyCategories
};

NSMODULE_DEFN(nsGipsyMOdule) = &kGipsyModule;

NS_IMPL_MOZILLA192_NSGETMODULE(&kGipsyModule)
