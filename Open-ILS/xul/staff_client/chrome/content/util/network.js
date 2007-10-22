dump('entering util/network.js\n');

if (typeof util == 'undefined') util = {};
util.network = function () {

	JSAN.use('util.error'); this.error = new util.error();
	JSAN.use('util.sound'); this.sound = new util.sound();

	return this;
};

util.network.prototype = {

	'link_id' : 0,

	'NETWORK_FAILURE' : null,

	'simple_request' : function(method_id,params,f,override_params) {
		//var obj = this;
		//var sparams = js2JSON(params);
		//obj.error.sdump('D_SES','simple_request '+ method_id +' '+obj.error.pretty_print(sparams.slice(1,sparams.length-1))+
		//	'\noverride_params = ' + override_params + '\n');
		if (typeof api[method_id] == 'undefined') throw( 'Method not found for ' + method_id );
		var secure = true; if (typeof api[method_id].secure != 'undefined') secure = api[method_id].secure;
		return this.request(api[method_id].app,api[method_id].method,params,f,override_params,{ 'secure' : secure, 'method_id' : method_id });
	},

	'get_result' : function (req) {
		var obj = this;
		var result;
		try {
			result = req.getResultObject();	
		} catch(E) {
			try {
				if (instanceOf(E, NetworkFailure)) {
					obj.NETWORK_FAILURE = E;
				} else {
					try { obj.NETWORK_FAILURE = js2JSON(E); } catch(F) { dump(F + '\n'); obj.NETWORK_FAILURE = E; };
				}
			} catch(I) { 
				obj.NETWORK_FAILURE = 'Unknown status';
			}
			result = null;
		}
		return result;
	},

	'request' : function (app,name,params,f,override_params,_params) {

		var obj = this;
		
		//var sparams = js2JSON(params);
		//obj.error.sdump('D_SES','request '+ app + ' ' + name +' '+obj.error.pretty_print(sparams.slice(1,sparams.length-1))+
		//	'\noverride_params = ' + override_params + '\n_params = ' + _params + '\n');

		try { 

			var request =  this._request(app,name,params,f,override_params,_params);
			if (request) {
				return this.get_result(request);
			} else {
				return null;
			}
	
		} catch(E) {
			alert(E); 
		}
	},

	'_request' : function (app,name,params,f,override_params,_params) {
		var obj = this;
		try {
			var sparams = js2JSON(params);
			obj.error.sdump('D_SES','_request '+app+' '+name+' '+obj.error.pretty_print(sparams.slice(1,sparams.length-1))+
				'\noverride_params = ' + override_params + '\n_params = ' + _params +
				'\nResult #' + (++obj.link_id) + ( f ? ' asynced' : ' synced' ) );

			var request = new RemoteRequest( app, name );
			if (_params && _params.secure) {
				request.setSecure(true);
			} else {
				request.setSecure(false);
			}
			for(var index in params) {
				request.addParam(params[index]);
			}
	
			if (f)  {
				request.setCompleteCallback(
					function(req) {
						try {
							var json_string = js2JSON(obj.get_result(req));
							obj.error.sdump('D_SES_RESULT','asynced result #' 
								+ obj.link_id + '\n\n' 
								+ (json_string.length > 80 ? obj.error.pretty_print(json_string) : json_string) 
								+ '\n\nOriginal Request:\n\n' 
								+ 'request '+app+' '+name+' '+ sparams.slice(1,sparams.length-1));
							req = obj.rerequest_on_session_timeout(app,name,params,req,override_params,_params);
							req = obj.rerequest_on_perm_failure(app,name,params,req,override_params,_params);
							if (override_params) {
								req = obj.rerequest_on_override(app,name,params,req,override_params,_params);
							}
							req = obj.check_for_offline(app,name,params,req,override_params,_params);
							f(req);
							obj.NETWORK_FAILURE = null;
						} catch(E) {
							try {
								E.ilsevent = -2;
								E.textcode = 'Server/Method Error';
							} catch(F) {}
							f( { 'getResultObject' : function() { return E; } } );
						}
					}
				);
				try {
					request.send(false);
				} catch(E) {
					throw(E);
				}
				return null;
			} else {
				try {
					request.send(true);
				} catch(E) {
					throw(E);
				}
				var result = obj.get_result(request);
				var json_string = js2JSON(result);
				this.error.sdump('D_SES_RESULT','synced result #' 
					+ obj.link_id + '\n\n' + ( json_string.length > 80 ? obj.error.pretty_print(json_string) : json_string ) 
					+ '\n\nOriginal Request:\n\n' 
					+ 'request '+app+' '+name+' '+ sparams.slice(1,sparams.length-1));
				request = obj.rerequest_on_session_timeout(app,name,params,request,override_params,_params);
				request = obj.rerequest_on_perm_failure(app,name,params,request,override_params,_params);
				if (override_params) {
					request = obj.rerequest_on_override(app,name,params,request,override_params,_params);
				}
				request = obj.check_for_offline(app,name,params,request,override_params,_params);
				obj.NETWORK_FAILURE = null;
				return request;
			}

		} catch(E) {
			alert(E);
			if (instanceOf(E,perm_ex)) {
				alert('in util.network, _request : permission exception: ' + js2JSON(E));
			}
			throw(E);
		}
	},

	'check_for_offline' : function (app,name,params,req,override_params,_params) {
		var obj = this;
		var result = obj.get_result(req);
		if (result != null) return req;

		JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
		var proceed = true;

		while(proceed) {

			proceed = false;

			var r;

			if (data.proceed_offline) {

				r = 1;

			} else {

				var network_failure_string;
				var network_failure_status_string;
				var msg;

				try { network_failure_string = String( obj.NETWORK_FAILURE ); } catch(E) { network_failure_string = E; }
				try { network_failure_status_string = typeof obj.NETWORK_FAILURE == 'object' && typeof obj.NETWORK_FAILURE != 'null' && typeof obj.NETWORK_FAILURE.status == 'function' ? obj.NETWORK_FAILURE.status() : ''; } catch(E) { network_failure_status_string = ''; obj.error.sdump('D_ERROR', 'setting network_failure_status_string: ' + E); }
				
				try { msg = 'Network/server failure.  Please check your Internet connection to ' + data.server_unadorned + ' and choose Retry Network.  If you need to enter Offline Mode, choose Ignore Errors in this and subsequent dialogs.  If you believe this error is due to a bug in Evergreen and not network problems, please contact your helpdesk or friendly Evergreen admins, and give them this information:\nmethod=' + name + '\nparams=' + js2JSON(params) + '\nTHROWN:\n' + network_failure_string + '\nSTATUS:\n' + network_failure_status_string; } catch(E) { msg = E; }

				try { obj.error.sdump('D_SES_ERROR',msg); } catch(E) { alert(E); }

				r = obj.error.yns_alert(msg,'Network Failure','Retry Network','Ignore Errors',null,'Check here to confirm this message');
				if (r == 1) {
					data.proceed_offline = true; data.stash('proceed_offline');
					dump('Remembering proceed_offline for 200000 ms.\n');
					setTimeout(
						function() {
							data.proceed_offline = false; data.stash('proceed_offline');
							dump('Setting proceed_offline back to false.\n');
						}, 200000
					);
				}
			}

			dump( r == 0 ? 'Retry Network\n' : 'Ignore Errors\n' );

			switch(r) {
				case 0: 
					req = obj._request(app,name,params,null,override_params,_params);
					if (obj.get_result(req)) proceed = true; /* daily WTF, why am I even doing this? :) */
					return req;
				break;
				case 1: 
					return { 'getResultObject' : function() { return { 'ilsevent' : -1, 'textcode' : 'Network/Server Problem' }; } };
				break;
			}
		}
	},

	'reset_titlebars' : function(data) {
		var obj = this;
		data.stash_retrieve();
		try {
			JSAN.use('util.window'); var win =  new util.window();
			var windowManager = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService();
			var windowManagerInterface = windowManager.QueryInterface(Components.interfaces.nsIWindowMediator);
			var enumerator = windowManagerInterface.getEnumerator(null);

			var w; // set title on all appshell windows
			while ( w = enumerator.getNext() ) {
				if (w.document.title.match(/^\d/)) {
					w.document.title = 
						win.appshell_name_increment() 
						+ ': ' + data.list.au[0].usrname() 
						+ '@' + data.ws_name;
						+ '.' + data.server_unadorned 
				}
			}
		} catch(E) {
			obj.error.standard_unexpected_error_alert('Error setting window titles to match new login',E);
		}
	},

	'get_new_session' : function(name,xulG,text) {
		var obj = this;
		try {

		netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
		var url = urls.XUL_AUTH_SIMPLE;
		if (typeof xulG != 'undefined' && typeof xulG.url_prefix == 'function') url = xulG.url_prefix( url );
		JSAN.use('util.window'); var win = new util.window();
		var my_xulG = win.open(
			url,
			//+ '?login_type=staff'
			//+ '&desc_brief=' + window.escape( text ? 'Session Expired' : 'Operator Change' )
			//+ '&desc_full=' + window.escape( text ? 'Please enter the credentials for a new login session.' : 'Please enter the credentials for the new login session.  Note that the previous session is still active.'),
			//'simple_auth' + (new Date()).toString(),
			'Authorize',
			'chrome,resizable,modal,width=700,height=500',
			{
				'login_type' : 'staff',
				'desc_brief' : text ? 'Session Expired' : 'Operator Change',
				'desc_full' : text ? 'Please enter the credentials for a new login session.' : 'Please enter the credentials for the new login session.  Note that the previous session is still active.',
				//'simple_auth' : (new Date()).toString(),
			}
		);
		JSAN.use('OpenILS.data');
		var data = new OpenILS.data(); data.init({'via':'stash'});
		if (typeof data.temporary_session != 'undefined' && data.temporary_session != '') {
			data.session.key = data.temporary_session.key; 
			data.session.authtime = data.temporary_session.authtime; 
			data.stash('session');
			if (! data.list.au ) data.list.au = [];
			data.list.au[0] = JSON2js( data.temporary_session.usr );
			data.stash('list');
			obj.reset_titlebars(data);
			return true;
		} else { alert('Error applying new auth session in network.js'); }
		return false;

		} catch(E) {
			obj.error.standard_unexpected_error_alert('util.network.get_new_session',E);
		}
	},

	'rerequest_on_session_timeout' : function(app,name,params,req,override_params,_params) {
		try {
			var obj = this;
			var robj = obj.get_result(req);
			if (robj != null && robj.ilsevent && robj.ilsevent == 1001) {

				if (obj.get_new_session(name,undefined,true)) {
					JSAN.use('OpenILS.data'); var data = new OpenILS.data(); data.init({'via':'stash'});
					params[0] = data.session.key;
					req = obj._request(app,name,params,null,override_params,_params);
				}
			}
		} catch(E) {
			this.error.standard_unexpected_error_alert('rerequest_on_session_timeout',E);
		}
		return req;
	},
	
	'rerequest_on_perm_failure' : function(app,name,params,req,override_params,_params) {
		try {
			var obj = this;
			var robj = obj.get_result(req);
			if (robj != null && robj.ilsevent && robj.ilsevent == 5000) {
				netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
				if (location.href.match(/^chrome/)) {
					//alert('Permission denied.');
				} else {
					JSAN.use('util.window'); var win = new util.window();
					var my_xulG = win.open(
						urls.XUL_AUTH_SIMPLE,
						//+ '?login_type=temp'
						//+ '&desc_brief=' + window.escape('Permission Denied: ' + robj.ilsperm)
						//+ '&desc_full=' + window.escape('Another staff member with the above permission may authorize this specific action.  Please notify your library administrator if you need this permission.  If you feel you have received this exception in error, inform your friendly Evergreen developers of the above permission and this debug information: ' + name),
						//'simple_auth' + (new Date()).toString(),
						'Authorize',
						'chrome,resizable,modal,width=700,height=500',
						{
							'login_type' : 'temp',
							'desc_brief' : 'Permission Denied: ' + robj.ilsperm,
							'desc_full' : 'Another staff member with the above permission may authorize this specific action.  Please notify your library administrator if you need this permission.  If you feel you have received this exception in error, please inform your friendly Evergreen developers or helpdesk staff of the above permission and this debug information: ' + name,
							//'simple_auth' : (new Date()).toString(),
						}
					);
					JSAN.use('OpenILS.data');
					//var data = new OpenILS.data(); data.init({'via':'stash'});
					if (typeof my_xulG.temporary_session != 'undefined' && my_xulG.temporary_session != '') {
						params[0] = my_xulG.temporary_session.key;
						req = obj._request(app,name,params,null,override_params,_params);
					}
				}
			}
		} catch(E) {
			this.error.sdump('D_ERROR',E);
		}
		return req;
	},

	'rerequest_on_override' : function (app,name,params,req,override_params,_params) {
		var obj = this;
		try {
			if (!override_params.text) override_params.text = {};
			function override(r) {
				try {
					netscape.security.PrivilegeManager.enablePrivilege('UniversalXPConnect UniversalBrowserWrite');
					obj.sound.bad();
					var xml = '<vbox xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">' + 
						'<groupbox><caption label="Exceptions"/>' + 
						'<grid><columns><column/><column/></columns><rows>';
					for (var i = 0; i < r.length; i++) {
						var t1 = String(r[i].ilsevent).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
						var t2 = String(r[i].textcode).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
						var t3 = String((override_params.text[r[i].ilsevent] ? override_params.text[r[i].ilsevent](r[i]) : '')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
						var t4 = String(r[i].desc).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
						xml += '<row>' + 
							'<description style="color: red" tooltiptext="' + t1 + '">' + t2 + '</description>' + 
							'<description>' + t3 + '</description>' + 
							'</row><row>' + '<description>' + t4 + '</description>' + '</row>';
					}
					xml += '</rows></grid></groupbox><groupbox><caption label="Override"/><hbox>' + 
						'<description>Force this action?</description>' + 
						'<button accesskey="N" label="No" name="fancy_cancel"/>' + 
						'<button id="override" accesskey="Y" label="Yes" name="fancy_submit" value="override"/></hbox></groupbox></vbox>';
					//JSAN.use('OpenILS.data');
					//var data = new OpenILS.data(); data.init({'via':'stash'});
					//data.temp_override_xml = xml; data.stash('temp_override_xml');
					JSAN.use('util.window'); var win = new util.window();
					var fancy_prompt_data = win.open(
						urls.XUL_FANCY_PROMPT,
						//+ '?xml_in_stash=temp_override_xml'
						//+ '&title=' + window.escape(override_params.title),
						'fancy_prompt', 'chrome,resizable,modal,width=700,height=500',
						{ 'xml' : xml, 'title' : override_params.title }
					);
					if (fancy_prompt_data.fancy_status == 'complete') {
						req = obj._request(app,name + '.override',params);
					}
					return req;
				} catch(E) {
					alert('in util.network, rerequest_on_override, override:' + E);
				}
			}

			var result = obj.get_result(req);
			if (!result) return req;

			if ( (typeof result.ilsevent != 'undefined') && (override_params.overridable_events.indexOf(result.ilsevent) != -1) ) {
				req = override([result]);
			} else {
				var found_good = false; var found_bad = false;
				for (var i = 0; i < result.length; i++) {
					if ( (result[i].ilsevent != 'undefined') && (override_params.overridable_events.indexOf(result[i].ilsevent) != -1) ) {
						found_good = true;
					} else {
						found_bad = true;
					}
				}
				if (found_good && (!found_bad)) req = override(result);
			}

			return req;
		} catch(E) {
			throw(E);
		}
	},


}

/*
function sample_callback(request) {
	var result = request.getResultObject();
}
*/

dump('exiting util/network.js\n');
