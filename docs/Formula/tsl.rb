# Generated sample for tap usage
class Tsl < Formula
  desc "Translate CLI powered by Effect/AI"
  homepage "https://github.com/soomtong/tsl"
  url "https://github.com/soomtong/tsl/releases/download/v0.1.0/tsl-macos.tar.gz"
  version "0.1.0"
  sha256 "47e160d31290c1dae8b891959a86217a3959aeae89a39d1769edfef4321d7807"
  license "MIT"

  def install
    bin.install "tsl"
  end

  test do
    system "#{bin}/tsl", "--help"
  end
end

