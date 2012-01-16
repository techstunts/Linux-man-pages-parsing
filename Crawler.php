<?php
Class Crawler
{
	var $curl;
	function __construct()
	{		
		$this->curl= curl_init();
	}
	//This is used for login.
	function logIn($loginActionUrl,$parameters)
	{
			curl_setopt ($this->curl, CURLOPT_URL,$loginActionUrl);	
			curl_setopt ($this->curl, CURLOPT_POST, 1);	
			curl_setopt ($this->curl, CURLOPT_POSTFIELDS, $parameters);	
			curl_setopt ($this->curl, CURLOPT_COOKIEJAR, 'cookie.txt');	
			curl_setopt ($this->curl, CURLOPT_RETURNTRANSFER, 1);
			curl_setopt ($this->curl, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT']);			
			curl_exec ($this->curl);						
	}
	function getContent($url)
	{
		curl_setopt($this->curl, CURLOPT_URL, $url);	
		curl_setopt ($this->curl, CURLOPT_RETURNTRANSFER, 1);
		$content=curl_exec ($this->curl);	
		return $content;
	}
	function fetchAndSaveLink($url, $filename){
		if(preg_match("/[^\w\.]/", $filename) || $filename == ''){
			echo "<p>Please check the given {$url} and {$filename}</p>";
			return ;
		}
		
		$filepath = __DIR__ . '/' . "man-pages-in-html/";
		$filename = $filepath . $filename . ".html";
		
		var_dump($url,$filename);
		$content = $this->getContent($url);
		$content = preg_replace('/<script\b[^>]*>(.*?)<\/script>/is', '', $content);
		$result = file_put_contents($filename, $content);

		return $result;
	}
	function hasProtocol($url)
	{			
		return strpos($url,"//");		
	}
	function getDomain($url)
	{
		$url_components = parse_url($url);
		return $url_components['scheme'] . '://' . $url_components['host'];
	}
	//Convert the link as It should be
	function convertLink($domain,$url,$link)
	{
		
		if($this->hasProtocol($link))
		{
			return $link;
		}		
		elseif (($link=='#')||($link=="/"))
		{			
			return $url;			
		}		
		//else if((strpos($link,'/'))==0)
                else if(substr($link,0,1)=="/")
		{
			return $domain.$link;			
                        
		}
		else 
		{
			return $domain."/".$link;			
		}
            
	}
	function crawlLinks($url)
	{
		$domain=$this->getDomain($url);echo $domain;
		$content=$this->getContent($url);//get the whole page
		$dom = new DOMDocument();
		@$dom->loadHTML($content);		
		$xpath = new DOMXPath($dom);
		$hrefs = $xpath->evaluate("//a");//get all a tags		
		for ($i = 0; $i < $hrefs->length; $i++) 
		{
			$href = $hrefs->item($i);//select an a tag									
			$links['link'][$i]=$this->convertLink($domain,$url,$href->getAttribute('href'));
			$links['text'][$i]=$href->nodeValue;		
		}
		return  $links;
		
	}
	//function for crawl image
	
	
	function crawlImage($url)
	{
		$content=$this->getContent($url);
		$domain=$this->getDomain($url);
		$dom = new DOMDocument();
		@$dom->loadHTML($content);		
		$xdoc = new DOMXPath($dom);	
		//Read the images that is between <a> tag
		$atags = $xdoc ->evaluate("//a");		//Read all a tags	
		$index=0;
		for ($i = 0; $i < $atags->length; $i++) 
		{
			$atag = $atags->item($i);			//select an a tag
			$imagetags=$atag->getElementsByTagName("img");//get img tag
			$imagetag=$imagetags->item(0);
			if(sizeof($imagetag)>0)//if img tag exists
			{
				$imagelinked['src'][$index]=$imagetag->getAttribute('src');//save image src
				$imagelinked['link'][$index]=$atag->getAttribute('href');//save image link		
				$index=$index+1;
			}
		}			
		//Read all image
		//Betweem <img> tag 
		$imagetags = $xdoc ->evaluate("//img");	//Read all img tags	
		$index=0;
		$indexlinked=0;
		for ($i = 0; $i < $imagetags->length; $i++) 
		{
			$imagetag = $imagetags->item($i);									
			$imagesrc=$imagetag->getAttribute('src');			
			$image['link'][$index]=null;
			if($imagesrc==$imagelinked['src'][$indexlinked])//check wheather this image has link
			{
				$image['link'][$index]=$this->convertLink($domain,$url,$imagelinked['link'][$indexlinked]);
				$indexlinked=$indexlinked+1;
			}
			$image['src'][$index]=$this->convertLink($domain,$url,$imagesrc);
			$index=$index+1;			
		}		
		return $image;	
	}
}
?>