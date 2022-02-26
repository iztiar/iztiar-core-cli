# Iztiar #

## Installation ##

Note: at the moment, this a rather a tool specification than an actual tool description.

### Installing ###

Install this piece of gold that Iztiar aims to be is as simple as just running one command in the console:

```bash
wget -O- https://www.github.com/iztiar/install/install.sh | sudo bash
```

You can also download and examine it to know exactly what it does. In brief:

- check your systems for prerequisites
- request from the console the configuration informations if they have not been provided in the command-line
- before doing anything, display a summary of what the script will do, requesting for a confirmation of a cancellation
- last, does the work hoping you have confirmed the stuff.

### install.sh development notes ###

- check that we are run by root
- accept command-line arguments
    - storage-dir
    - account-name
    - account-uid
    - account-gid
    - environment name
- detect, gather and later install all prerequisites
    - the latest Node.js LTS version
    - development and compilation tools for the host: gcc-c++, make, python3, 'Development Tools' group
    - mongodb software
- interactively ask to the user the configuration informations if they have not been provided in the command-line
- may propose a set of Iztiar base packages
- display a summary of:
    - the checks which have been done
    - the packages which will be installed
    - the way the system will be modified (user account, directory and so on)
- request a confirmation or a cancellation
- if confirmed:
    - install missing packages
    - define a name/uid/guid account

        `useradd -b /var/lib -G wheel -m -r -U iztiar`
    - create storageDir
    - define the systemd services
        - controller
        - meteor-web-ui
        - rest-api
        - mongodb
    - install a set of selectionned Iztiar base packages
    - define the initial set of configuration files
    - provide a full log of its actions

The installer should focalize on installing all services on a single host. Spanning the environment on several hosts should be considered as an advanced alternative.
