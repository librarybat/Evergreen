#!/usr/bin/perl
use strict;

use OpenILS::Application::Storage;
use OpenILS::Application::Storage::CDBI;

# I need to abstract the driver loading away...
use OpenILS::Application::Storage::Driver::Pg;

use CGI qw/:standard start_*/;

OpenILS::Application::Storage::CDBI->connection('dbi:Pg:host=10.0.0.2;dbname=open-ils-dev', 'postgres');
OpenILS::Application::Storage::CDBI->db_Main->{ AutoCommit } = 1;

my $cgi = new CGI;

#-------------------------------------------------------------------------------
# HTML part
#-------------------------------------------------------------------------------

print <<HEADER;
Content-type: text/html

<html>

<head>
	<style>
		table.table_class {
			border: dashed lightgrey 1px;
			background-color: #EEE;
			border-collapse: collapse;
		}

		deactivated {
			color: lightgrey;
		}

		tr.row_class td {
			border: solid lightgrey 1px;
		}
		
		tr.header_class th {
			background-color: lightblue;
		}

	</style>
<body style='padding: 25px;'>

<h1>User Profile Setup</h1>
<hr/>

HEADER

#-------------------------------------------------------------------------------
# setup part
#-------------------------------------------------------------------------------

my %profile_cols = ( qw/id SysID name Name/ );

my @col_display_order = ( qw/id name/ );

#-------------------------------------------------------------------------------
# Logic part
#-------------------------------------------------------------------------------

if (my $action = $cgi->param('action')) {
	if ( $action eq 'Remove Selected' ) {
		for my $id ( ($cgi->param('id')) ) {
			actor::profile->retrieve($id)->delete;
		}
	} elsif ( $action eq 'Update Selected' ) {
		for my $id ( ($cgi->param('id')) ) {
			my $u = actor::profile->retrieve($id);
			$u->name( $cgi->param("name_$id") );
			$u->update;
		}
	} elsif ( $action eq 'Add New' ) {
		actor::profile->create( { name => $cgi->param("name") } );
	}
}


#-------------------------------------------------------------------------------
# Form part
#-------------------------------------------------------------------------------
{
	#-----------------------------------------------------------------------
	# User form
	#-----------------------------------------------------------------------
	print	"<form method='POST'>".
		"<table class='table_class'><tr class='header_class'>\n";
	
	for my $col ( @col_display_order ) {
		print th($profile_cols{$col});
	}
	
	print '<th>Action</th></tr>';
	
	for my $row ( sort { $a->name cmp $b->name } (actor::profile->retrieve_all) ) {
		print Tr(
			td( $row->id() ),
			td("<input type='text' name='name_$row' value='". $row->name() ."'>"),
			td("<input type='checkbox' value='$row' name='id'>"),
		);
	}

	print Tr(
		td(),
		td("<input type='text' name='name'>"),
		td(),
	);
	print	"</table>";
	print	"<input type='submit' name='action' value='Remove Selected'/> | ";
	print	"<input type='submit' name='action' value='Update Selected'/> | ";
	print	"<input type='submit' name='action' value='Add New'/></form><hr/>";
}

print "</body></html>";


