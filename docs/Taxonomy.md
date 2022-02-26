# Iztiar #

## Taxonomy ##

- coreBroker

The _coreBroker_ is managed by the _coreController_ to which it is attached, and manages itself the MQTT messaging bus.

- coreController

The _coreController_ is one of the services required to run Iztiar (see [Architecture](./Architecture.md) for a description).

A _coreController_ is identified by its name, and this name must be unique on the host (inside of the storage directory). More, we suggest to make this name unique in the whole environment.

- Device

As its name says, a device is before all something that is able to send some informations and/or receive some commands.

A device may gather several sensors and/or actioners: for example, we may imagine a device with temperature and light sensors, a push button, and a gate opener. Which caracterizes the device here is that it is installed as one block, will be moved as one same block, finally replaced or decommissionned as another time same block.

Besides of this physical device, a plugin let the user define virtual devices, which are thought to gather informations and/or commands in another way that the physical devices do.

- Environment

We are talking here about _development_ vs. _staging_ vs. _production_, etc. to use some widely used terms. You can have as many environments as you like, and name them as you want.

From the core application point of vieuw, you can have as many environments as you want on a same host, and each and every plugin may define in its settings environment-dependant specificities.

The environment is materialized by its storage directory which is uniquely attached to it.

Environments are meant to be self-content, and __do not communicate between each others__.

- Gateway

A gateway is something which manages some devices of the same nature. Common example of gateways are protocol gateways which manage a given protocol, e.g. Z-Wave gateway, Zigbee gateway, MySensors gateway, RFXCom gateway, and so on.

Because Iztiar is protocol agnostic, at least one gateway is required to manage a given protocol.

A gateway is attached to one _coreController_ as a plugin.

- Storage directory

The storage directory is the top of the file tree of all software and data used by Iztiar for a given environment. Storage directory is set at install time.

There is one main `<storageDir>`, defaulting to `/var/lib/iztiar` in *nix-like systems. As said above, this is the root directory for configurations, plugins, data storage, logs.

This hard-coded default is overridable at install time.

Because `<storageDir>` addresses all configuration files, it is also determinant when qualifying a running environment (production, development, staging, test and so on).
