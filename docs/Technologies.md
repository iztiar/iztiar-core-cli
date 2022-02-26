# Iztiar #

## Technologies ##

### Development language ###

Our first technical strategy and decision is to build a full (i.e. both client-side and server-side) javascript software.

More, developing with javascript language lead us to try to take advantage of it and target a full ESM (EcmaScript modules) architecture.

So Node.js (which is one of the prerequisites) minimal version must be 12 LTS for its ESM support.

See also :

- [Pure ESM package](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c)
- [ES Modules in NodeJS](https://docs.joshuatz.com/cheatsheets/node-and-npm/node-esm/)

### User interface framework ###

Our second technical strategy and decision is to use [Meteor](https://www.meteor.com/) to handle the user interface. This decision is obviously at least in a part driven by the first decision above.

As a consequence, the database will be a mongodb instance.

### Messaging ###

The software relies on a messaging bus, which is MQTT-driven.

### Security ###

From our point of view, the security of any information system depends of three main aspects:

- integrity : one must be sure that the information it receives is exactly what has been sent
- confidentiality : one must be sure that the information sent to a target is only readable by this target
- non-repudiation: one must be sure that the emitter of a received information cannot say that it never sends it.

We have chosen to implement these three points at the very core of the architecture through a certificate-based point-to-point communication system.

In other words, all the security relies on a predefined configuration, where a trustee administrator configures each point-to-point communication channel by defining who is authorized to communicate which who.

### Javascript consequences ###
