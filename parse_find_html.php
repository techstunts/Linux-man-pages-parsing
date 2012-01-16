<?php

$content = file_get_contents("watch.html");
preg_match("'<div id=\"banner\"[^>]*>(.*?)</div>'is", $content, $matches);
var_dump($matches);
//die;



include_once 'simple_html_dom.php';
$html = new simple_html_dom();  
  
// Load a file 
$filename = __DIR__ . '/' . "man-pages-in-html/watch.html";
$filename = __DIR__ . '/' . "watch.html";
$html->load_file($filename);

//$element = $html->find("#banner");
//echo $element;
//$element->outertext = '';

//$html->find("#banner");
$html->dump();
die;


$tags_to_find = array("h1", "h2", "h3", "dt", "p");

foreach($tags_to_find  as $tag){
	$element = $html->find($tag);  
	for($i=0; $i<count($element); $i++){
		var_dump($element[$i]->innertext);
	}
}

die;

$doc = new DOMDocument();

// load the HTML string we want to strip
$doc->loadHTMLFile($filename);

// get all the script tags
$tags = $doc->getElementsByTagName('h2');
var_dump($tags, $doc);

for ($i = 0; $i < $tags->length; $i++) {
	var_dump($tags->item($i));
    echo $tags->item($i)->nodeValue . "<br/>";
}
//$length = $script_tags->length;
