/*
 * cli-tree.js
 *
 * Display the hierarchy of running services
 * Returns a Promise resolved with the list of controllers name.
 */
import { Iztiar, coreRunfile, msg } from './imports.js';

import { cliListRunnings } from './cli-list-runnings.js';

export function cliListTree( options={} ){

    msg.out( 'Listing hierarchy tree of running services' );

    return new Promise(( resolve, reject ) => {
        cliListRunnings({ verbose:0 })
            .then(( services ) => {
                // we build a recursive list where each level is an element { name,forkable,json,children }

                // a function which returns an array of services which are managed by this manager
                //  each returned service is flagged as already returned in the services array
                function _iterFn( forkable, manager ){
                    let _found = [];
                    let _unflagged = 0;
                    services.every(( s ) => {
                        for( const _forked in s.json ){
                            if( !s.json[_forked].flagged ){
                                _unflagged += 1;
                                if( !forkable || _forked === forkable ){
                                    const _srv = s.json[_forked];
                                    //console.log( 'forkable='+forkable, 'manager='+manager );
                                    //console.log( 'srv', _srv );
                                    if(( !manager && !_srv.manager ) || manager === _srv.manager ){
                                        _found.push({ name:s.name, forkable:_forked, json:_srv, children:[] });
                                        s.json[_forked].flagged = true;
                                        _unflagged -= 1;
                                    }
                                }
                            }
                        }
                        return true;
                    });
                    return { unflagged:_unflagged, found:_found };
                }

                // search for top controller(s)
                let _res = _iterFn( Iztiar.c.forkable.CONTROLLER );
                let _tree = [];
                if( _res.found.length ){
                    _tree.push( ..._res.found );
                } else {
                    // search for a said-manager coreController which would not be present
                }

                // for each level of tree, search for managed-by until there is no more unflagged
                //  because our hierarchy is by-design only one-level deep, we don't care to build a true recursivity
                while( _res.unflagged ){
                    _tree.every(( s ) => {
                        _res = _iterFn( null, s.name );
                        s.children.push( ..._res.found );
                        s.children.every(( c ) => {
                            _res = _iterFn( null, c.name );
                            c.children.push( ..._res.found );
                            return true;
                        })
                        return true;
                    })
                    //console.log( 'unflagged='+_res.unflagged );
                }
                //console.log( 'tree', _tree );

                // display the hierarchy
                function _levelFn( item, level ){
                    let _prefix = '';
                    if( level === 0 ){
                        _prefix = '+-';
                    } else {
                        for( let i=0 ; i<level ; ++i ){
                            _prefix += '   ';
                        }
                        _prefix += '+-';
                    }
                    msg.out( '  '+_prefix+' '+item.name+' '+ item.forkable );
                }

                _tree.every(( root ) => {
                    //console.log( root );
                    _levelFn( root, 0 );
                    root.children.every(( c ) => {
                        //console.log( c );
                        _levelFn( c, 1 );
                        c.children.every(( subc ) => {
                            _levelFn( subc, 2 );
                            return true;
                        })
                        return true;
                    });
                    return true;
                });
            });
    });
}
