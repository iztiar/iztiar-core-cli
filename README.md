# Iztiar #

## Liminaries ##

Iztiar aims to form a big family of packages (and, of course, nothing less) to drive a set of sensors, actioners, scenarios, and the glue around all of these.
Put in together, we so are building a home automation application, the dream of an automated home, a building supervision software, etc.

Thanks to the designed unique architecture, we do not at the moment identify any limit to the possible usages.

As of 0.x versions, we are still in the long process of drawing the future plans and evaluating implementation patterns.

In other words, though all is public and published in gthub and npmjs, nothing is really finalized, and the application still does nothing :( 
	
At least, it is almost bug-free!

So, please be patient...

## iztiar-core ##

___iztiar-core___ (this package) is the very core of the whole software family. It is expected to provide:

- the coreController service to be initially started, along with the commands to manage it
- the core of the Meteor user interface
- the REST API server and its first primitives
- the certificate-based security framework.

See also:

- the [Technologies](./docs/Technologies.md) document which describes the used technologies
- the [Architecture](./docs/Architecture.md) description
- the [Taxonomy](./docs/Taxonomy.md) document which defines and  explain the notions used here
- , and, last, the [Installation](./docs/Installation.md) to know how to install this piece of gold :)

## Some notes about the _iztiar_ word ##

According to [Wikipedia](https://en.wikipedia.org/), _Itziar_ may be understood as both a spain city and a female given name.

According to [Etre parents](https://etreparents.com/30-prenoms-sans-genre/), _Itziar_ would originate from basque language, and would be appliable to both male and female persons. It would mean «&nbsp;champ d’étoiles&nbsp;» in french, or «&nbsp;field of stars&nbsp;» in english.

Other considered names were:

- adomojs: Authomatized Domus Javascript
- adomong: Authomatized Dom New Generation
- or see also how [NodeJS](https://nodejs.com) which finds three new words each time we reload the page..;)

## A copyright notice ##

First, and though lot of the code has been redesigned or rewritten, the very first code set has been shamelessly forked from [homebridge](https://github.com/homebridge).

Second, many ideas have been taken from [Jeedom](https://www.jeedom.com/site/en/index.html).

Third, many ideas have also been pulled from other automation softwares, either current or stopped as the day...
