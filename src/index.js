var view_loader = {
    load : function(request){
        /*
            promise to load the view and retreive the compiler
        */
        var promise_load_of_view = this._load(request);

        /*
            append the .generate() function to the promise returned by load to enable `.load().generate()`
        */
        promise_load_of_view.generate = function(){
            return this.then((compiler)=>{
                return compiler.generate();
            })
        }

        /*
            return promise that resolves with compiler
        */
        return promise_load_of_view;
    },

    _load : async function(request){
        /*
            derive the paths to the compiler and html
        */
        var paths = await this.retreive_paths(request)

        /*
            retreive compiler and dom promises
                - define promises and THEN wait for each one
        */
        var promise_compiler = load(paths.compiler);
        var promise_dom = this.retreive_dom_from_html_path(paths.html);
        var compiler = await promise_compiler;
        var dom = await promise_dom;

        /*
            initialize compiler
        */
        var compiler = this.wrap_compiler_generator_function(compiler, dom);

        /*
            resolve with compiler
        */
        return compiler;
    },


    retreive_paths : async function(request){
        /*
            retreive path to files - handling node_modules as well
                - Therefore, assume that if there is no "/" in the name that it is a node module.
        */
        if(request.indexOf("/") == -1){ // if no "/" present, this is a node module. load the dom and compiler as defined in the package.json
            // define module basic info
            var module_name = request;
            var module_root_path = window.clientside_require.modules_root + "/" + module_name;

            // retreive package_json contents
            var package_json_path = module_root_path +  "/package.json"; // derive where to expect the package.json file
            var package_json = await load(package_json_path); // retreive the package_json contents

            // define path to compiler - which is the main script
            if(typeof package_json.main == "undefined") package_json.main = "compiler.js"; // commonjs require assumes this is the case if not defined
            var compiler_path = module_root_path +  "/" + package_json.main;

            // define path to view - which is in the same dir as compiler under name "view.html"
            var components_root = compiler_path.substring(0, compiler_path.lastIndexOf("/")); // get dir of file of compilerpath
            var html_path = components_root + "/view.html";
        } else { // else we're given an absolute or a relative path to the dir of the view.
            var compiler_path = request + "/compiler.js";
            var html_path = request + "/view.html";
        }

        /*
            validate paths
        */
        var compiler_file_name = "compiler.js";
        if(compiler_path.slice(-1*compiler_file_name.length) !== compiler_file_name) throw new Error("view module main must be `compiler.js` - invalid module");

        /*
            return paths
        */
        var paths = {
            compiler : compiler_path,
            html : html_path,
        }
        return paths;
    },

    retreive_dom_from_html_path : async function(html_path){
        var html = await load(html_path) // retreive html
        var dom = this.convert_html_into_dom(html); // convert html to dom
        return dom;
    },

    convert_html_into_dom : function(html){
        var holder = window.document.createElement("div");
        holder.innerHTML = html;
        var dom = holder.childNodes[0];
        return dom;
    },

    wrap_compiler_generator_function : function(compiler, dom){
        if(typeof compiler.generate !== "function") throw new Error("view module compiler must be have a `generate` method - invalid module")
        if(compiler.generator_wrapped == true) return compiler; // if true, we hae already wrapped it previously. since we store the data in cache and we manipulate it by reference this could occur. do not duplicate this wrapping.
        try { // try to wrap the generator function to inject the dom and standardize the output as a promise
            var original_generator = compiler.generate.bind(compiler); // ensure to bind "this" correctly;
            compiler.generate = function(options){
                var result = original_generator(dom.cloneNode(true), options) // 1. inject a dom clone directly into generator
                return Promise.resolve(result);  // 2. wrap compiler function in a promise to make the output standard;
            }
            compiler.generator_wrapped = true;
        } catch (err){ // catch errors if they occur; typically occures if the user did not define a generate function in the compiler.js
            console.error(err);
            console.warn("due to the above error, clientside-view-loader was not able to finalize the generate function for " + request)
        }
        return compiler;
    },

}
module.exports = view_loader;
