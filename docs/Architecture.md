# Iztiar #

## Architecture ##

### A high-level survey of the architecture ###

The environment as we understand it (see [Taxonomy](./Taxonomy.md)) may span on several hosts which together provide following services:

- one database instance (here mongodb),
- at least one ___coreController___ per host,
- at least one ___coreBroker___ per host, which itself manages the messaging bus,
- one REST API server which publishes and manages our public API,
- zero to several UI server(s).

### The coreController ###

A ___coreController___ is thought to manage other daemons.

Basically, the _coreController_ is at the heart of the whole system. It is responsible of:

- the ___coreBroker___ management: there must be at least one _coreBroker_ per host, and should be only one; the _coreBroker_ is attached to a _coreController_
- the plugins management, or, at least, the management of the plugins attached to this instance of the _coreController_,
- last, of writing operations in the database.

If you have many devices (see [Taxonomy](./Taxonomy.md)) or many gateways (see [Taxonomy](./Taxonomy.md)), you may configure several _coreControllers_, maybe on several hosts. Most of the configurations, though, will reside on a single host.

But, one more time, this is in no case at all, forced by anything: if it happens that first host resources are too heavily consumed, then you are free to span to a second host, a third, and so on.

Several _coreController_'s - whether they are running on one host or on several hosts, collaborate together through the messaging service.
