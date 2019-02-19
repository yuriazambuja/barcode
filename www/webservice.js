function WebService(wsdl){
	this.endpoint = "";
	this.namespace = "";
	this.qualified = false;
	this.constants = {soap:"http://schemas.xmlsoap.org/wsdl/soap/",wsdl:"http://schemas.xmlsoap.org/wsdl/",
		xsd:"http://www.w3.org/2001/XMLSchema",env:"http://schemas.xmlsoap.org/soap/envelope/"};
	this.structure = {};
	this.extension = {};
	this.operations = {};
	this.messages = {};
	this.buffer = [];
	this.loading = 0;
	this.soap_username = null;
	this.soap_password = null;
	this.stop = function(){
		this.loading++;
	};
	this.play = function(){
		this.loading--;
		if(this.test()){
			while(this.buffer.length){
				this.execute(this.buffer.pop());
			}
		}
	};
	this.test = function(){
		return !this.loading;
	};
	this.call = function(){
		if(this.test()){
			this.execute(arguments);
		}else{
			this.buffer.push(arguments);
		}
	};
	this.request = function(get,post,action,callback){
		var connection;
		if(window.XDomainRequest){
			connection = new window.XDomainRequest();
		}else if(window.ActiveXObject){
			try{
				connection = new ActiveXObject("Msxml2.XMLHTTP");
			}catch(e){
				connection = new ActiveXObject("Microsoft.XMLHTTP");
			}
		}else{
			connection = new XMLHttpRequest();
		}
		connection.master = this;
		connection.onreadystatechange=function(){
			if(connection.readyState==4){
				callback(this);
			}
		};
		connection.open(post?"POST":"GET",get);
		if(post){
			connection.setRequestHeader("content-type","text/xml");
			//connection.setRequestHeader("SOAPAction","\""+action+"\"");
		}

		connection.send(post?post:null);
		return true;
	};
	this.initialize = function(url){
		this.stop();
		this.request(url,null,null,function(result){
			if(result.status==200){
				result.master.namespace = result.responseXML.documentElement.getAttribute("targetNamespace");
				result.master.schemas(result.responseXML);
				var address = result.responseXML.getElementsByTagNameNS(result.master.constants.soap,"address");
				if(address.length){
					result.master.endpoint = address[0].getAttribute("location");
				}
				var operation = result.responseXML.getElementsByTagNameNS(result.master.constants.wsdl,"operation");
				for(i=0;i<operation.length;i++){
					var method = operation[i].getAttribute("name");
					if(!result.master.operations[operation[i].getAttribute("name")]){
						result.master.operations[method] = {};
					}
					for(j in operation[i].childNodes){
						var element = operation[i].childNodes[j];
						if(element.localName=="operation"){
							result.master.operations[method].action = element.getAttribute("soapAction");
						}else if(element.localName){
							var type = element.getAttribute("message");
							if(type){
								result.master.operations[method][element.localName] = type.substring(type.indexOf(":")+1);
							}
						}
					}
				}
				var messages = result.responseXML.getElementsByTagNameNS(result.master.constants.wsdl,"message");
				for(i=0;i<messages.length;i++){
					var name = messages[i].getAttribute("name");
					for(j in messages[i].childNodes){
						if(messages[i].childNodes[j].localName=="part"){
							var type = messages[i].childNodes[j].getAttribute("element");
							if(type){
								result.master.messages[name] = type.substring(type.indexOf(":")+1);
							}
						}
					}
				}
			}else{
				alert('NÃO: '+result.status);
			}
			result.master.play();
		});
	};
	this.schemas = function(object){
		var elements = object.getElementsByTagNameNS(this.constants.xsd,"schema");
		for(i in elements){
			if(elements[i].localName && elements[i].getAttribute("elementFormDefault")){
				this.qualified = (elements[i].getAttribute("elementFormDefault")=="qualified");
			}
			for(j in elements[i].childNodes){
				if(elements[i].childNodes[j].localName=="import"){
					this.stop();
					this.request(elements[i].childNodes[j].getAttribute("schemaLocation"),null,null,function(result){
						if(result.status==200){
							result.master.schemas(result.responseXML);
						}else{
							alert('NÃO: '+result.status);
						}
						result.master.play();
					});
				}else if(elements[i].childNodes[j].localName=="complexType"){
					this.complex(elements[i].childNodes[j],elements[i].childNodes[j].getAttribute("name"));
				}else if(elements[i].childNodes[j].localName=="element"){
					var name = elements[i].childNodes[j].getAttribute("name");
					var type = elements[i].childNodes[j].getAttribute("type");
					if(!type){
						type = name;
						this.complex(elements[i].childNodes[j],type);
					}
					this.structure["$"+name] = [];
					this.structure["$"+name][name] = {};
					this.structure["$"+name][name].type = type.substring(type.indexOf(":")+1);
					this.structure["$"+name][name].loop = false;
				}
			}
		}
	};
	this.complex = function(object,parent){
		this.structure[parent] = [];
		var extension = object.getElementsByTagNameNS(this.constants.xsd,"extension");
		var base = extension.length ? extension[0].getAttribute("base") : null;
		if(base){
			this.extension[parent] = base.substring(base.indexOf(":")+1);
		}
		var simple = object.getElementsByTagNameNS(this.constants.xsd,"element");
		for(j=0;j<simple.length;j++){
			var child = simple[j].getAttribute("name");
			var loop = simple[j].getAttribute("maxOccurs");
			var type = simple[j].getAttribute("type");
			this.structure[parent][child] = {};
			this.structure[parent][child].type = type.substring(type.indexOf(":")+1);
			this.structure[parent][child].loop = loop!=null&&loop!=1;
		}
	};
	this.execute = function(args){
		if(args[0] && this.operations[args[0]]){
			var input = this.messages[this.operations[args[0]].input];
			xml = "<x:Envelope xmlns:x=\""+this.constants.env+"\" xmlns:z=\""+this.namespace+"\">";
			if(this.soap_username||this.soap_password){
				xml+= "<x:Header><wsse:Security xmlns:wsse=\"http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd\"><wsse:UsernameToken>";
				xml+= "<wsse:Username>"+this.soap_username+"</wsse:Username><wsse:Password>"+this.soap_password+"</wsse:Password></wsse:UsernameToken></wsse:Security></x:Header>";
			}
			xml+= "<x:Body>";
			for(i in this.structure['$'+input]){
				xml+= this.compose(i,this.structure['$'+input][i].type,args[1],true);
			}
			xml+= "</x:Body></x:Envelope>";

			this.request(this.endpoint,xml,this.operations[args[0]].action,function(result){
				if(args[2]){
					var object;
					var elements = result.responseXML.getElementsByTagNameNS(result.master.constants.env,"Body");
					if(elements.length){
						var message = result.master.operations[args[0]][result.status==200?'output':'fault'];
						var output = result.master.messages[message];
						for(i in result.master.structure['$'+output]){
							var layout = result.master.structure['$'+output][i].type;
							for(j in elements[0].childNodes){
								if(elements[0].childNodes[j].localName){
									object = result.master.parser(elements[0].childNodes[j],layout);
								}
							}
						}
					}
					callback = args[2];
					callback(result.status,object);
				}
			});
		}
	};
	this.compose = function(tagname,format,object,prefix){
		xml = "<"+(prefix?"z:":"")+tagname+">";
		if(format=="int"||format=="float"||format=="decimal"||format=="string"){
			xml+= object;
		}else{
			for(i in this.structure[format]){
				if(typeof object[i] !== 'undefined'){
					if(this.structure[format][i]){
						layout = this.structure[format][i];
					}else{
						if(this.extension[format]){
							layout = this.structure[this.extension[format]][i];
						}
					}
					if(layout){
						xml+= this.compose(i,this.structure[format][i].type,object[i],this.qualified);
					}
				}
			}
		}
		xml+= "</"+(prefix?"z:":"")+tagname+">";
		return xml;
	}
	this.parser = function(element,format){
		if(format=="string"){
			return element.textContent.trim();
		}else if(format=="dateTime"||format=="date"||format=="time"){
			return new Date(element.textContent.trim());
		}else if(format=="boolean"){
			return (element.textContent.trim()!="false");
		}else if(format=="int"||format=="float"||format=="decimal"){
			return Number(element.textContent);
		}else{
			var object = {};
			for(i in element.childNodes){
				var child = element.childNodes[i];
				if(element.childNodes[i].localName){
					if(this.structure[format][child.localName]){
						layout = this.structure[format][child.localName];
					}else{
						if(this.extension[format]){
							layout = this.structure[this.extension[format]][child.localName];
						}
					}
					if(layout){
						item = this.parser(child,layout.type);
						if(layout.loop){
							if(!object[child.localName]){
								object[child.localName] = [];
							}
							object[child.localName].push(item);
						}else{
							object[child.localName] = item;
						}
					}
				}
			}
			return object;
		}
	}
	this.soapauth = function(username,password){
		this.soap_username = username;
		this.soap_password = password;
		return this;
	}
	this.initialize(wsdl);
}
