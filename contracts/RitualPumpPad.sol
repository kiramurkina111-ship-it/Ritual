// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract RitualPumpToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public launchpad;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint256 supply_, address owner_) {
        name = name_;
        symbol = symbol_;
        launchpad = msg.sender;
        _mint(owner_, supply_);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "zero address");
        require(balanceOf[from] >= value, "balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }
}

contract RitualPumpPad {
    struct TokenMeta {
        address creator;
        string name;
        string symbol;
        string description;
        string imageURI;
        string omen;
        uint256 launchedAt;
    }

    struct TokenStats {
        uint256 soldTokens;
        uint256 ritualReserve;
        uint256 vibeScore;
        bool exists;
    }

    uint256 public constant UNIT = 1 ether;
    uint256 public constant MAX_WHOLE_TOKENS = 1_000_000;
    uint256 public constant CREATOR_ALLOCATION = 0;
    uint256 public basePrice = 0.00000001 ether;
    uint256 public slope = 0.00000000001 ether;
    uint256 public launchFee = 0.01 ether;
    uint256 public tradeFeeBps = 100;

    address public owner;
    address public treasury;
    address[] private allTokens;
    bool private locked;

    mapping(address => TokenMeta) private tokenMeta;
    mapping(address => TokenStats) private tokenStats;

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        uint256 vibeScore
    );
    event TokensBought(address indexed token, address indexed buyer, uint256 wholeTokens, uint256 paid);
    event TokensSold(address indexed token, address indexed seller, uint256 wholeTokens, uint256 received);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "locked");
        locked = true;
        _;
        locked = false;
    }

    constructor(address treasury_) {
        owner = msg.sender;
        treasury = treasury_ == address(0) ? msg.sender : treasury_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata description,
        string calldata imageURI,
        string calldata omen
    ) external payable nonReentrant returns (address) {
        require(bytes(name).length > 0 && bytes(name).length <= 40, "bad name");
        require(bytes(symbol).length > 0 && bytes(symbol).length <= 10, "bad symbol");
        require(msg.value >= launchFee, "launch fee");

        RitualPumpToken created = new RitualPumpToken(name, symbol, MAX_WHOLE_TOKENS * UNIT, address(this));
        address token = address(created);

        if (CREATOR_ALLOCATION > 0) {
            created.transfer(msg.sender, CREATOR_ALLOCATION * UNIT);
        }

        uint256 vibeScore = 35 + (uint256(keccak256(abi.encodePacked(msg.sender, name, symbol, block.number))) % 66);
        _saveTokenInfo(token, name, symbol, description, imageURI, omen, vibeScore);
        allTokens.push(token);

        _sendValue(treasury, launchFee);
        if (msg.value > launchFee) {
            _sendValue(msg.sender, msg.value - launchFee);
        }

        emit TokenLaunched(token, msg.sender, vibeScore);
        return token;
    }

    function _saveTokenInfo(
        address token,
        string calldata name,
        string calldata symbol,
        string calldata description,
        string calldata imageURI,
        string calldata omen,
        uint256 vibeScore
    ) internal {
        tokenMeta[token] = TokenMeta({
            creator: msg.sender,
            name: name,
            symbol: symbol,
            description: description,
            imageURI: imageURI,
            omen: omen,
            launchedAt: block.timestamp
        });
        tokenStats[token] = TokenStats({
            soldTokens: 0,
            ritualReserve: 0,
            vibeScore: vibeScore,
            exists: true
        });
    }

    function buy(address token, uint256 wholeTokens) external payable nonReentrant {
        TokenStats storage stats = tokenStats[token];
        require(stats.exists, "token");
        require(wholeTokens > 0, "amount");
        require(stats.soldTokens + wholeTokens <= MAX_WHOLE_TOKENS - CREATOR_ALLOCATION, "sold out");

        (uint256 total, uint256 fee, uint256 cost) = quoteBuy(token, wholeTokens);
        require(msg.value >= total, "payment");

        stats.soldTokens += wholeTokens;
        stats.ritualReserve += cost;

        RitualPumpToken(token).transfer(msg.sender, wholeTokens * UNIT);
        if (fee > 0) {
            _sendValue(treasury, fee);
        }
        if (msg.value > total) {
            _sendValue(msg.sender, msg.value - total);
        }

        emit TokensBought(token, msg.sender, wholeTokens, total);
    }

    function sell(address token, uint256 wholeTokens) external nonReentrant {
        TokenStats storage stats = tokenStats[token];
        require(stats.exists, "token");
        require(wholeTokens > 0 && wholeTokens <= stats.soldTokens, "amount");

        (uint256 payout, uint256 fee, uint256 gross) = quoteSell(token, wholeTokens);
        require(stats.ritualReserve >= gross, "reserve");

        stats.soldTokens -= wholeTokens;
        stats.ritualReserve -= gross;

        RitualPumpToken(token).transferFrom(msg.sender, address(this), wholeTokens * UNIT);
        if (fee > 0) {
            _sendValue(treasury, fee);
        }
        _sendValue(msg.sender, payout);

        emit TokensSold(token, msg.sender, wholeTokens, payout);
    }

    function quoteBuy(address token, uint256 wholeTokens)
        public
        view
        returns (uint256 total, uint256 fee, uint256 cost)
    {
        TokenStats storage stats = tokenStats[token];
        require(stats.exists, "token");
        cost = _curveCost(stats.soldTokens, wholeTokens);
        fee = (cost * tradeFeeBps) / 10_000;
        total = cost + fee;
    }

    function quoteSell(address token, uint256 wholeTokens)
        public
        view
        returns (uint256 payout, uint256 fee, uint256 gross)
    {
        TokenStats storage stats = tokenStats[token];
        require(stats.exists, "token");
        require(wholeTokens <= stats.soldTokens, "amount");
        uint256 start = stats.soldTokens - wholeTokens;
        gross = _curveCost(start, wholeTokens);
        fee = (gross * tradeFeeBps) / 10_000;
        payout = gross - fee;
    }

    function getTokens() external view returns (address[] memory) {
        return allTokens;
    }

    function getTokenBasics(address token) external view returns (address creator, uint256 launchedAt) {
        TokenMeta storage meta = tokenMeta[token];
        return (meta.creator, meta.launchedAt);
    }

    function getTokenStrings(address token)
        external
        view
        returns (string memory name, string memory symbol, string memory description)
    {
        TokenMeta storage meta = tokenMeta[token];
        return (meta.name, meta.symbol, meta.description);
    }

    function getTokenMedia(address token) external view returns (string memory imageURI, string memory omen) {
        TokenMeta storage meta = tokenMeta[token];
        return (meta.imageURI, meta.omen);
    }

    function getTokenStats(address token)
        external
        view
        returns (uint256 soldTokens, uint256 ritualReserve, uint256 vibeScore, bool exists)
    {
        TokenStats storage stats = tokenStats[token];
        return (stats.soldTokens, stats.ritualReserve, stats.vibeScore, stats.exists);
    }

    function setFees(uint256 launchFee_, uint256 tradeFeeBps_) external onlyOwner {
        require(tradeFeeBps_ <= 500, "fee too high");
        launchFee = launchFee_;
        tradeFeeBps = tradeFeeBps_;
    }

    function setCurve(uint256 basePrice_, uint256 slope_) external onlyOwner {
        basePrice = basePrice_;
        slope = slope_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "zero address");
        treasury = treasury_;
    }

    function _curveCost(uint256 sold, uint256 amount) internal view returns (uint256) {
        uint256 linear = amount * basePrice;
        uint256 first = sold * amount;
        uint256 triangle = (amount * (amount - 1)) / 2;
        uint256 curved = (first + triangle) * slope;
        return linear + curved;
    }

    function _sendValue(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "send failed");
    }
}
