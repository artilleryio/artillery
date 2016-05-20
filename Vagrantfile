Vagrant.configure("2") do |config|

  # The name of the box(s) to run.
  config.vm.box = "box-cutter/centos67"
  config.vm.network "forwarded_port", guest: 3003, host: 3003
  # Configure the virtual machine hardware
  config.vm.provider "virtualbox" do |vb|
    vb.customize ["modifyvm", :id, "--memory", "1024"]
    vb.customize ["modifyvm", :id, "--ioapic", "on"]
    vb.customize ["modifyvm", :id, "--cpus", "2"]
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
  end


  config.vm.define "dev-artillery", primary: true do |server|
    # Share host folder on guest machine
    server.vm.synced_folder ".", "/vagrant", :disabled => true
    server.vm.synced_folder '.', '/opt/artillery', owner: 'vagrant', group: 'vagrant'

    # Update packages
    #server.vm.provision "shell" do |s|
    #  s.inline = "yum clean all; yum -y update"
    #  s.privileged = true
    #end
    #setup nodejs install
    server.vm.provision "shell" do |s|
      s.inline = "curl --silent --location https://rpm.nodesource.com/setup_4.x | bash -"
      s.privileged = true
    end
    #install node
    server.vm.provision "shell" do |s|
      s.inline = "yum install -y nodejs"
      s.privileged = true
    end

    # Install project dependencies
    server.vm.provision "shell" do |s|
      s.inline = "cd /opt/artillery; npm install; npm install -g eslint; npm install jscs -g"
      s.privileged = true
    end
    # Install git
    server.vm.provision "shell" do |s|
      s.inline = "yum install -y git"
      s.privileged = true
    end
    
    # Install bats
    server.vm.provision "shell" do |s|
      s.inline = "git clone https://github.com/sstephenson/bats.git; cd bats; ./install.sh /usr/local"
      s.privileged = true
    end

  end
end